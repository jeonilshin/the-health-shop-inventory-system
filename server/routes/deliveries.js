const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { notifyLocation } = require('./notifications');
const { logAudit } = require('../middleware/auditLog');

// Get all deliveries with items
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT d.*, 
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as created_by_name,
        au.full_name as admin_confirmed_by_name,
        t.id as transfer_id,
        t.status as transfer_status,
        COALESCE(
          json_agg(
            json_build_object(
              'id', di.id,
              'description', di.description,
              'unit', di.unit,
              'quantity', di.quantity,
              'unit_cost', di.unit_cost,
              'notes', di.notes
            )
          ) FILTER (WHERE di.id IS NOT NULL), '[]'
        ) as items,
        COALESCE(SUM(di.quantity * COALESCE(di.unit_cost, 0)), 0) as total_value
      FROM deliveries d
      LEFT JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN users au ON d.admin_confirmed_by = au.id
      LEFT JOIN transfers t ON d.transfer_id = t.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by user role
    if (req.user.role === 'branch_manager' || req.user.role === 'branch_staff') {
      query += ` AND d.to_location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (req.user.role === 'warehouse') {
      query += ` AND d.from_location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    }
    
    if (status) {
      query += ` AND d.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    query += ' GROUP BY d.id, fl.name, tl.name, u.full_name, au.full_name, t.id, t.status ORDER BY d.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get delivery by ID with items
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT d.*, 
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as created_by_name,
        json_agg(
          json_build_object(
            'id', di.id,
            'description', di.description,
            'unit', di.unit,
            'quantity', di.quantity,
            'unit_cost', di.unit_cost,
            'notes', di.notes
          )
        ) as items
      FROM deliveries d
      LEFT JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE d.id = $1
      GROUP BY d.id, fl.name, tl.name, u.full_name
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create delivery (items must exist in source inventory)
router.post('/', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      from_location_id,
      to_location_id,
      delivery_date,
      status,
      notes,
      items
    } = req.body;
    
    // Validate items exist in source inventory
    if (!items || items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one item is required' });
    }
    
    // Check all items exist in source inventory with sufficient quantity
    for (const item of items) {
      const inventoryCheck = await client.query(
        'SELECT quantity, unit_cost FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
        [from_location_id, item.description, item.unit]
      );
      
      if (inventoryCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          error: `Item "${item.description}" not found in source location inventory` 
        });
      }
      
      if (inventoryCheck.rows[0].quantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient quantity for "${item.description}". Available: ${inventoryCheck.rows[0].quantity}, Requested: ${item.quantity}` 
        });
      }
      
      // Add unit_cost from inventory
      item.unit_cost = inventoryCheck.rows[0].unit_cost;
    }
    
    // Create delivery
    const deliveryResult = await client.query(`
      INSERT INTO deliveries (
        from_location_id, to_location_id, delivery_date, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [from_location_id, to_location_id, delivery_date, status || 'pending', notes, req.user.id]);
    
    const delivery = deliveryResult.rows[0];
    
    // Add delivery items
    for (const item of items) {
      await client.query(`
        INSERT INTO delivery_items (delivery_id, description, unit, quantity, unit_cost, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [delivery.id, item.description, item.unit, item.quantity, item.unit_cost, item.notes || null]);
    }
    
    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_CREATE',
      tableName: 'deliveries',
      recordId: delivery.id,
      newValues: { ...delivery, items },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Created delivery with ${items.length} item(s)`
    });
    
    // Fetch complete delivery with items
    const completeDelivery = await pool.query(`
      SELECT d.*, 
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as created_by_name,
        json_agg(
          json_build_object(
            'id', di.id,
            'description', di.description,
            'unit', di.unit,
            'quantity', di.quantity,
            'unit_cost', di.unit_cost
          )
        ) as items
      FROM deliveries d
      LEFT JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE d.id = $1
      GROUP BY d.id, fl.name, tl.name, u.full_name
    `, [delivery.id]);
    
    res.status(201).json(completeDelivery.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Update delivery status (auto-update inventory when delivered)
router.put('/:id', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status } = req.body;

    await client.query('BEGIN');

    // Get delivery details with items
    const delivery = await client.query(
      `SELECT d.*, 
              json_agg(json_build_object(
                'id', di.id,
                'description', di.description,
                'unit', di.unit,
                'quantity', di.quantity,
                'unit_cost', di.unit_cost
              )) as items
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.id = $1
       GROUP BY d.id`,
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    // If changing status to 'delivered', update inventory
    if (status === 'delivered' && deliveryData.status !== 'delivered') {
      // Deduct from source location and add to destination location
      for (const item of deliveryData.items) {
        if (item.id) { // Check if item exists
          // Check source inventory
          const sourceCheck = await client.query(
            'SELECT quantity FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
            [deliveryData.from_location_id, item.description, item.unit]
          );

          if (sourceCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
              error: `Item "${item.description}" not found in source location` 
            });
          }

          if (sourceCheck.rows[0].quantity < item.quantity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
              error: `Insufficient quantity for "${item.description}" in source location. Available: ${sourceCheck.rows[0].quantity}, Required: ${item.quantity}` 
            });
          }

          // Deduct from source location
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE location_id = $2 AND description = $3 AND unit = $4',
            [item.quantity, deliveryData.from_location_id, item.description, item.unit]
          );

          // Add to destination location (or update if exists)
          await client.query(
            `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, suggested_selling_price) 
             VALUES ($1, $2, $3, $4, $5, $5) 
             ON CONFLICT (location_id, description, unit) 
             DO UPDATE SET quantity = inventory.quantity + $4, updated_at = CURRENT_TIMESTAMP`,
            [deliveryData.to_location_id, item.description, item.unit, item.quantity, item.unit_cost]
          );
        }
      }
    }

    // Update delivery status
    const result = await client.query(
      'UPDATE deliveries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: status === 'delivered' ? 'DELIVERY_COMPLETE' : 'DELIVERY_UPDATE',
      tableName: 'deliveries',
      recordId: id,
      oldValues: { status: deliveryData.status },
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated delivery status to ${status}${status === 'delivered' ? ' - Inventory transferred' : ''}`
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Delete delivery (admin only, only if not delivered)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if delivery is already delivered
    const delivery = await pool.query('SELECT status FROM deliveries WHERE id = $1', [id]);
    
    if (delivery.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    if (delivery.rows[0].status === 'delivered') {
      return res.status(400).json({ error: 'Cannot delete a delivered delivery. Inventory has already been updated.' });
    }
    
    await pool.query('DELETE FROM deliveries WHERE id = $1', [id]);
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_DELETE',
      tableName: 'deliveries',
      recordId: id,
      oldValues: delivery.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted delivery (status: ${delivery.rows[0].status})`
    });
    
    res.json({ message: 'Delivery deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin confirms delivery (allows branch to see it)
router.post('/:id/admin-confirm', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const delivery = await client.query(
      'SELECT * FROM deliveries WHERE id = $1',
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    if (deliveryData.status !== 'awaiting_admin') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Delivery is not awaiting admin confirmation' });
    }

    // Update delivery status
    await client.query(
      `UPDATE deliveries 
       SET status = 'admin_confirmed', 
           admin_confirmed = true,
           admin_confirmed_by = $1,
           admin_confirmed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.id, id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_ADMIN_CONFIRM',
      tableName: 'deliveries',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Admin confirmed delivery - Ready for branch acceptance`
    });
    
    // Notify branch about confirmed delivery
    const locationInfo = await client.query(
      'SELECT name FROM locations WHERE id = $1',
      [deliveryData.to_location_id]
    );
    
    await notifyLocation(
      deliveryData.to_location_id,
      'delivery_confirmed',
      'Delivery Confirmed by Admin',
      `Delivery is on the way to ${locationInfo.rows[0]?.name}. Please accept when it arrives.`,
      '/deliveries'
    );
    
    res.json({ message: 'Delivery confirmed by admin. Branch can now see and accept it.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Branch accepts delivery (completes the transfer)
router.post('/:id/accept', auth, authorize('admin', 'branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const delivery = await client.query(
      `SELECT d.*, di.description, di.unit, di.quantity, di.unit_cost
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.id = $1`,
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    // Check if user has access to destination location
    if (req.user.role === 'branch_manager' && req.user.location_id != deliveryData.to_location_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to this delivery' });
    }

    if (deliveryData.status !== 'admin_confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Delivery must be confirmed by admin before acceptance' });
    }

    // Add items to destination inventory
    for (const item of delivery.rows) {
      if (item.description) {
        await client.query(
          `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, suggested_selling_price) 
           VALUES ($1, $2, $3, $4, $5, $5) 
           ON CONFLICT (location_id, description, unit) 
           DO UPDATE SET quantity = inventory.quantity + $4, updated_at = CURRENT_TIMESTAMP`,
          [deliveryData.to_location_id, item.description, item.unit, item.quantity, item.unit_cost]
        );
      }
    }

    // Update delivery status to delivered
    await client.query(
      `UPDATE deliveries 
       SET status = 'delivered', 
           delivered_date = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    // Update linked transfer status to delivered
    if (deliveryData.transfer_id) {
      await client.query(
        `UPDATE transfers 
         SET status = 'delivered', 
             delivered_by = $1,
             delivered_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [req.user.id, deliveryData.transfer_id]
      );
    }

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_ACCEPT',
      tableName: 'deliveries',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Branch accepted delivery - Items added to inventory and transfer completed`
    });
    
    // Notify warehouse about completed delivery
    await notifyLocation(
      deliveryData.from_location_id,
      'delivery_completed',
      'Delivery Completed',
      `Delivery to branch has been accepted and completed`,
      '/deliveries'
    );
    
    res.json({ message: 'Delivery accepted! Items added to your inventory and transfer completed.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
