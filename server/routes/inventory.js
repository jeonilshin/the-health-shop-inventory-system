const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

// Get all inventory across all locations (admin only)
router.get('/all', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, l.name as location_name, l.type as location_type
       FROM inventory i
       JOIN locations l ON i.location_id = l.id
       ORDER BY l.type DESC, l.name, i.description`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get inventory by location
router.get('/location/:locationId', auth, async (req, res) => {
  try {
    const { locationId } = req.params;
    
    // Check if user has access to this location
    if (req.user.role !== 'admin' && req.user.location_id != locationId) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const result = await pool.query(
      'SELECT * FROM inventory WHERE location_id = $1 ORDER BY description',
      [locationId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add inventory item (admin and warehouse only)
router.post('/', auth, authorize('admin', 'warehouse'), async (req, res) => {
  try {
    const { location_id, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number } = req.body;
    
    // Check if user has access to this location
    if (req.user.role === 'warehouse' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'Warehouse staff can only add inventory to their own location' });
    }

    const result = await pool.query(
      `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       ON CONFLICT (location_id, description, unit) 
       DO UPDATE SET 
         quantity = inventory.quantity + $4, 
         unit_cost = $5, 
         suggested_selling_price = $6,
         expiry_date = COALESCE($7, inventory.expiry_date),
         batch_number = COALESCE($8, inventory.batch_number),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [location_id, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number]
    );
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'INVENTORY_ADD',
      tableName: 'inventory',
      recordId: result.rows[0].id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Added ${quantity} ${unit} of ${description} to inventory`
    });
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update inventory item (admin only - for manual adjustments)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number } = req.body;
    
    // Get old values for audit
    const oldData = await pool.query('SELECT * FROM inventory WHERE id = $1', [id]);
    
    const result = await pool.query(
      `UPDATE inventory 
       SET description = $1, unit = $2, quantity = $3, unit_cost = $4, suggested_selling_price = $5, 
           expiry_date = $6, batch_number = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'INVENTORY_UPDATE',
      tableName: 'inventory',
      recordId: id,
      oldValues: oldData.rows[0],
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated inventory: ${description} (Qty: ${oldData.rows[0]?.quantity} → ${quantity})`
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete inventory item
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get item details before deletion
    const item = await pool.query('SELECT * FROM inventory WHERE id = $1', [id]);
    
    await pool.query('DELETE FROM inventory WHERE id = $1', [id]);
    
    // Log audit
    if (item.rows.length > 0) {
      await logAudit({
        userId: req.user.id,
        username: req.user.username,
        action: 'INVENTORY_DELETE',
        tableName: 'inventory',
        recordId: id,
        oldValues: item.rows[0],
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        description: `Deleted inventory item: ${item.rows[0].description}`
      });
    }
    
    res.json({ message: 'Inventory item deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convert units (e.g., BOX to PC) - for branches only
router.post('/convert-units', auth, authorize('branch_manager', 'branch_staff'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { fromItemId, toItemId, unitsPerBox, boxesToConvert } = req.body;
    
    // Validate inputs
    if (!fromItemId || !toItemId || !unitsPerBox || !boxesToConvert) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (parseFloat(unitsPerBox) <= 0 || parseFloat(boxesToConvert) <= 0) {
      return res.status(400).json({ error: 'Units per box and boxes to convert must be positive numbers' });
    }
    
    await client.query('BEGIN');
    
    // Get the from item
    const fromItemResult = await client.query(
      'SELECT * FROM inventory WHERE id = $1',
      [fromItemId]
    );
    
    if (fromItemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'From item not found' });
    }
    
    const fromItem = fromItemResult.rows[0];
    
    // Check if user has access to this location
    if (req.user.role !== 'admin' && req.user.location_id != fromItem.location_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to this location' });
    }
    
    // Check if sufficient quantity
    if (parseFloat(fromItem.quantity) < parseFloat(boxesToConvert)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient quantity. Available: ${fromItem.quantity} ${fromItem.unit}, Requested: ${boxesToConvert} ${fromItem.unit}` 
      });
    }
    
    // Get the to item
    const toItemResult = await client.query(
      'SELECT * FROM inventory WHERE id = $1',
      [toItemId]
    );
    
    if (toItemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'To item not found' });
    }
    
    const toItem = toItemResult.rows[0];
    
    // Verify both items are in the same location
    if (fromItem.location_id !== toItem.location_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Both items must be in the same location' });
    }
    
    // Calculate conversion
    const piecesToAdd = parseFloat(unitsPerBox) * parseFloat(boxesToConvert);
    
    // Update from item (reduce quantity)
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [boxesToConvert, fromItemId]
    );
    
    // Update to item (increase quantity)
    await client.query(
      'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [piecesToAdd, toItemId]
    );
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UNIT_CONVERSION',
      tableName: 'inventory',
      recordId: fromItemId,
      oldValues: { from: fromItem, to: toItem },
      newValues: { 
        converted: `${boxesToConvert} ${fromItem.unit} → ${piecesToAdd} ${toItem.unit}`,
        unitsPerBox 
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Converted ${boxesToConvert} ${fromItem.unit} of ${fromItem.description} to ${piecesToAdd} ${toItem.unit}`
    });
    
    await client.query('COMMIT');
    
    res.json({ 
      message: 'Units converted successfully',
      converted: {
        from: `${boxesToConvert} ${fromItem.unit}`,
        to: `${piecesToAdd} ${toItem.unit}`
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;


// Get expiring items (items expiring within specified days)
router.get('/expiring/:days', auth, async (req, res) => {
  try {
    const { days } = req.params;
    const daysInt = parseInt(days) || 30;
    
    let query = `
      SELECT i.*, l.name as location_name, l.type as location_type
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      WHERE i.expiry_date IS NOT NULL 
        AND i.expiry_date <= CURRENT_DATE + INTERVAL '${daysInt} days'
        AND i.quantity > 0
    `;
    
    // Filter by location for non-admin users
    const params = [];
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ' AND i.location_id = $1';
      params.push(req.user.location_id);
    }
    
    query += ' ORDER BY i.expiry_date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get expired items
router.get('/expired', auth, async (req, res) => {
  try {
    let query = `
      SELECT i.*, l.name as location_name, l.type as location_type
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      WHERE i.expiry_date IS NOT NULL 
        AND i.expiry_date < CURRENT_DATE
        AND i.quantity > 0
    `;
    
    // Filter by location for non-admin users
    const params = [];
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ' AND i.location_id = $1';
      params.push(req.user.location_id);
    }
    
    query += ' ORDER BY i.expiry_date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get inventory history (all unique items ever in inventory - for autocomplete)
router.get('/history/all', auth, async (req, res) => {
  try {
    // Get all unique inventory items with their most recent details
    const query = `
      SELECT DISTINCT ON (description, unit, batch_number)
        description, 
        unit,
        unit_cost,
        suggested_selling_price,
        batch_number,
        expiry_date
      FROM inventory
      WHERE description IS NOT NULL
      ORDER BY description, unit, batch_number, updated_at DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get inventory history (all unique items ever in inventory - for branch managers to request)
router.get('/history', auth, authorize('admin', 'branch_manager'), async (req, res) => {
  try {
    // Get unique items from inventory, transfers, and sales history
    const query = `
      SELECT DISTINCT 
        description, 
        unit,
        MAX(unit_cost) as unit_cost,
        MAX(suggested_selling_price) as suggested_selling_price
      FROM (
        SELECT description, unit, unit_cost, suggested_selling_price FROM inventory
        UNION
        SELECT description, unit, unit_cost, NULL as suggested_selling_price FROM transfers
        UNION
        SELECT description, unit, unit_cost, NULL as suggested_selling_price FROM sales
      ) AS all_items
      GROUP BY description, unit
      ORDER BY description, unit
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product history (sales, transfers, imports) for a specific inventory item
router.get('/history/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the inventory item details
    const itemResult = await pool.query(
      'SELECT description, unit, location_id FROM inventory WHERE id = $1',
      [id]
    );
    
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const item = itemResult.rows[0];
    
    // Get all history for this product (by description and unit)
    const history = [];
    
    // 1. Sales transactions
    const salesResult = await pool.query(
      `SELECT 
        'sale' as type,
        id,
        transaction_date as date,
        quantity_sold as quantity,
        unit_price,
        total_amount,
        payment_method,
        sold_by_name as user_name,
        customer_name,
        location_id,
        l.name as location_name,
        created_at
      FROM sales_transactions st
      JOIN locations l ON st.location_id = l.id
      WHERE st.item_description = $1 AND st.item_unit = $2
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 100`,
      [item.description, item.unit]
    );
    
    // 2. Transfers (both sent and received)
    const transfersResult = await pool.query(
      `SELECT 
        'transfer' as type,
        t.id,
        t.transfer_date as date,
        t.quantity,
        t.unit_cost,
        t.status,
        t.transferred_by_name as user_name,
        t.from_location_id,
        t.to_location_id,
        fl.name as from_location_name,
        tl.name as to_location_name,
        t.created_at
      FROM transfers t
      JOIN locations fl ON t.from_location_id = fl.id
      JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.description = $1 AND t.unit = $2
        AND (t.from_location_id = $3 OR t.to_location_id = $3)
      ORDER BY t.transfer_date DESC, t.created_at DESC
      LIMIT 100`,
      [item.description, item.unit, item.location_id]
    );
    
    // 3. Inventory adjustments (from audit log)
    const adjustmentsResult = await pool.query(
      `SELECT 
        'adjustment' as type,
        id,
        created_at as date,
        action,
        username as user_name,
        old_values,
        new_values,
        description as audit_description
      FROM audit_log
      WHERE table_name = 'inventory'
        AND (old_values->>'description' = $1 OR new_values->>'description' = $1)
        AND (old_values->>'unit' = $2 OR new_values->>'unit' = $2)
      ORDER BY created_at DESC
      LIMIT 50`,
      [item.description, item.unit]
    );
    
    // Combine and sort all history
    const allHistory = [
      ...salesResult.rows,
      ...transfersResult.rows,
      ...adjustmentsResult.rows
    ].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
    
    res.json(allHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
