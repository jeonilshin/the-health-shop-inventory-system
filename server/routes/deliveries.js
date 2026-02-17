const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Get all deliveries with items
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT d.*, 
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as created_by_name,
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
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE d.status = $1';
      params.push(status);
    }
    
    query += ' GROUP BY d.id, fl.name, tl.name, u.full_name ORDER BY d.created_at DESC';
    
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
    res.json({ message: 'Delivery deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
