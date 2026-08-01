const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

// Get all inventory across all locations
// Admin: every location. Branch manager: every branch they're assigned to (manager_branches + primary).
router.get('/all', auth, authorize('admin', 'branch_manager'), async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'audit') {
      const result = await pool.query(
        `SELECT i.*, l.name as location_name, l.type as location_type
         FROM inventory i
         JOIN locations l ON i.location_id = l.id
         ORDER BY l.type DESC, l.name, i.description`
      );
      return res.json(result.rows);
    }

    // branch_manager: filter to assigned branches
    const { getManagerLocations } = require('../middleware/auth');
    const managerLocations = await getManagerLocations(req.user.id, 'branch_manager');
    const locationIds = managerLocations.map(l => l.id);

    if (locationIds.length === 0) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT i.*, l.name as location_name, l.type as location_type
       FROM inventory i
       JOIN locations l ON i.location_id = l.id
       WHERE i.location_id = ANY($1)
       ORDER BY l.type DESC, l.name, i.description`,
      [locationIds]
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

    // Access check: admin → all; branch_manager → primary or assigned branches; others → primary only
    const { hasLocationAccess } = require('../middleware/auth');
    const allowed = await hasLocationAccess(req.user.id, req.user.role, locationId);
    if (!allowed) {
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

// Get all branches for a specific product (admin only)
router.get('/product-branches/:description/:unit', auth, authorize('admin'), async (req, res) => {
  try {
    const { description, unit } = req.params;
    
    const result = await pool.query(
      `SELECT i.*, l.name as location_name, l.type as location_type
       FROM inventory i
       JOIN locations l ON i.location_id = l.id
       WHERE i.description = $1 AND i.unit = $2
       ORDER BY l.type DESC, l.name, i.cost_batch_id`,
      [decodeURIComponent(description), decodeURIComponent(unit)]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add inventory item (admin and warehouse only)
router.post('/', auth, authorize('admin', 'warehouse'), async (req, res) => {
  try {
    let { 
      location_id, 
      description, 
      unit, 
      quantity, 
      unit_cost, 
      suggested_selling_price, 
      expiry_date, 
      batch_number,
      is_new_item = false,
      is_new_cost = false
    } = req.body;
    
    // Check if user has access to this location
    if (req.user.role === 'warehouse' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'Warehouse staff can only add inventory to their own location' });
    }

    // Check if item exists with different cost/price/expiry
    const existingItems = await pool.query(
      'SELECT * FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3 ORDER BY created_at DESC',
      [location_id, description, unit]
    );

    // If cost is 0 or empty, use the previous batch's cost and price
    if ((!unit_cost || parseFloat(unit_cost) === 0) && existingItems.rows.length > 0) {
      const previousBatch = existingItems.rows[0];
      unit_cost = previousBatch.unit_cost;
      suggested_selling_price = suggested_selling_price || previousBatch.suggested_selling_price;
    }

    // Generate cost batch ID
    const timestamp = Date.now();
    const costBatchId = `BATCH-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    // Check if exact same batch exists (same cost AND expiry date)
    const exactMatch = existingItems.rows.find(item => {
      const costMatches = parseFloat(item.unit_cost) === parseFloat(unit_cost);
      const priceMatches = parseFloat(item.suggested_selling_price || 0) === parseFloat(suggested_selling_price || 0);
      const expiryMatches = (item.expiry_date ? new Date(item.expiry_date).toISOString().split('T')[0] : null) === (expiry_date || null);
      
      return costMatches && priceMatches && expiryMatches;
    });

    let result;
    let createdNewBatch = false;
    
    if (exactMatch) {
      // Add to existing batch with same cost, price, AND expiry
      result = await pool.query(
        `UPDATE inventory 
         SET quantity = quantity + $1, 
             max_quantity = GREATEST(max_quantity, quantity + $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 
         RETURNING *`,
        [quantity, exactMatch.id]
      );
      createdNewBatch = false;
    } else {
      // Create new batch for different cost, price, OR expiry date
      result = await pool.query(
        `INSERT INTO inventory 
         (location_id, description, unit, quantity, unit_cost, suggested_selling_price, 
          expiry_date, batch_number, max_quantity, is_new_item, is_new_cost, cost_batch_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $4, $9, $10, $11) 
         RETURNING *`,
        [location_id, description, unit, quantity, unit_cost, suggested_selling_price, 
         expiry_date, batch_number, is_new_item || (existingItems.rows.length === 0), 
         is_new_cost || (existingItems.rows.length > 0), costBatchId]
      );
      createdNewBatch = true;
    }

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
      description: `Added ${quantity} ${unit} of ${description} to inventory${createdNewBatch ? ' (new cost batch)' : ''}`
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
           expiry_date = $6, batch_number = $7, 
           max_quantity = GREATEST(COALESCE(max_quantity, 0), $3),
           updated_at = CURRENT_TIMESTAMP
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

// Update inventory prices per branch (admin only)
router.put('/branch-price/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { unit_cost, suggested_selling_price } = req.body;
    
    // Get old values for audit
    const oldData = await pool.query('SELECT * FROM inventory WHERE id = $1', [id]);
    
    if (oldData.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    const result = await pool.query(
      `UPDATE inventory 
       SET unit_cost = $1, suggested_selling_price = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [unit_cost, suggested_selling_price, id]
    );
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'INVENTORY_PRICE_UPDATE',
      tableName: 'inventory',
      recordId: id,
      oldValues: { 
        unit_cost: oldData.rows[0].unit_cost, 
        suggested_selling_price: oldData.rows[0].suggested_selling_price 
      },
      newValues: { unit_cost, suggested_selling_price },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated prices for ${oldData.rows[0].description} at ${oldData.rows[0].location_name || 'location'}: Cost ₱${oldData.rows[0].unit_cost} → ₱${unit_cost}, Price ₱${oldData.rows[0].suggested_selling_price} → ₱${suggested_selling_price}`
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

// Convert units (e.g., BOX to PC) - for branches and admin
router.post('/convert-units', auth, authorize('admin', 'branch_manager', 'branch_staff'), async (req, res) => {
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
        error: `Insufficient quantity. Available: ${parseFloat(fromItem.quantity).toFixed(2)} ${fromItem.unit}, Requested: ${boxesToConvert}` 
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
    
    // Log audit with conversion details for undo capability
    const auditResult = await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UNIT_CONVERSION',
      tableName: 'inventory',
      recordId: fromItemId,
      oldValues: { 
        from: { id: fromItem.id, quantity: fromItem.quantity, description: fromItem.description, unit: fromItem.unit },
        to: { id: toItem.id, quantity: toItem.quantity, description: toItem.description, unit: toItem.unit }
      },
      newValues: { 
        converted: `${boxesToConvert} ${fromItem.unit} → ${piecesToAdd} ${toItem.unit}`,
        unitsPerBox,
        fromItemId,
        toItemId,
        boxesToConvert,
        piecesToAdd
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
      },
      auditId: auditResult?.id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get conversion history for a location
router.get('/conversion-history/:locationId', auth, authorize('admin', 'branch_manager', 'branch_staff'), async (req, res) => {
  try {
    const { locationId } = req.params;

    const { hasLocationAccess } = require('../middleware/auth');
    const allowed = await hasLocationAccess(req.user.id, req.user.role, locationId);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }
    
    // Get conversion history from audit log (only last 24 hours for undo capability)
    const result = await pool.query(
      `SELECT 
        al.id,
        al.user_id,
        al.username,
        al.action,
        al.record_id,
        al.old_values,
        al.new_values,
        al.description,
        al.created_at,
        al.ip_address,
        CASE 
          WHEN al.created_at > NOW() - INTERVAL '24 hours' AND al.action = 'UNIT_CONVERSION' THEN true
          ELSE false
        END as can_undo
      FROM audit_log al
      WHERE al.action IN ('UNIT_CONVERSION', 'UNDO_CONVERSION')
        AND al.table_name = 'inventory'
        AND al.record_id IN (
          SELECT id FROM inventory WHERE location_id = $1
        )
      ORDER BY al.created_at DESC
      LIMIT 100`,
      [locationId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Undo a unit conversion (only within 24 hours)
router.post('/undo-conversion/:auditId', auth, authorize('admin', 'branch_manager', 'branch_staff'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the audit log entry
    const auditResult = await client.query(
      `SELECT * FROM audit_log 
       WHERE id = $1 AND action = 'UNIT_CONVERSION' AND table_name = 'inventory'`,
      [req.params.auditId]
    );
    
    if (auditResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conversion record not found' });
    }
    
    const audit = auditResult.rows[0];
    
    // Check if conversion is within 24 hours
    const conversionTime = new Date(audit.created_at);
    const now = new Date();
    const hoursDiff = (now - conversionTime) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot undo conversions older than 24 hours' });
    }
    
    // Check if already undone
    const undoCheck = await client.query(
      `SELECT * FROM audit_log 
       WHERE action = 'UNDO_CONVERSION' AND new_values->>'original_audit_id' = $1`,
      [req.params.auditId]
    );
    
    if (undoCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This conversion has already been undone' });
    }
    
    const fromItemId = audit.new_values.fromItemId;
    const toItemId = audit.new_values.toItemId;
    const boxesToConvert = parseFloat(audit.new_values.boxesToConvert);
    const piecesToAdd = parseFloat(audit.new_values.piecesToAdd);
    
    // Get current items to verify they exist
    const fromItemResult = await client.query('SELECT * FROM inventory WHERE id = $1', [fromItemId]);
    const toItemResult = await client.query('SELECT * FROM inventory WHERE id = $1', [toItemId]);
    
    if (fromItemResult.rows.length === 0 || toItemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'One or both items no longer exist' });
    }
    
    const fromItem = fromItemResult.rows[0];
    const toItem = toItemResult.rows[0];
    
    // Check if user has access to this location
    if (req.user.role !== 'admin' && req.user.location_id != fromItem.location_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to this location' });
    }
    
    // Check if toItem has sufficient quantity to reverse
    if (parseFloat(toItem.quantity) < piecesToAdd) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot undo: Insufficient quantity in ${toItem.description}. Available: ${toItem.quantity}, Required: ${piecesToAdd}` 
      });
    }
    
    // Reverse the conversion
    await client.query(
      'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [boxesToConvert, fromItemId]
    );
    
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [piecesToAdd, toItemId]
    );
    
    // Log the undo action
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UNDO_CONVERSION',
      tableName: 'inventory',
      recordId: fromItemId,
      oldValues: { 
        from: { id: fromItem.id, quantity: fromItem.quantity },
        to: { id: toItem.id, quantity: toItem.quantity }
      },
      newValues: { 
        original_audit_id: req.params.auditId,
        reversed: `${piecesToAdd} ${toItem.unit} → ${boxesToConvert} ${fromItem.unit}`
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Undid conversion: ${boxesToConvert} ${fromItem.unit} of ${fromItem.description} restored from ${piecesToAdd} ${toItem.unit}`
    });
    
    await client.query('COMMIT');
    
    res.json({ 
      message: 'Conversion undone successfully',
      reversed: {
        from: `${piecesToAdd} ${toItem.unit}`,
        to: `${boxesToConvert} ${fromItem.unit}`
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get cost batches for a specific item (for transfers and sales) - DEPRECATED, use expiry-batches
router.get('/cost-batches/:locationId/:description/:unit', auth, async (req, res) => {
  try {
    const { locationId, description, unit } = req.params;

    const { hasLocationAccess } = require('../middleware/auth');
    const allowed = await hasLocationAccess(req.user.id, req.user.role, locationId);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const result = await pool.query(
      `SELECT id, cost_batch_id, unit_cost, suggested_selling_price, quantity, 
              batch_number, expiry_date, is_new_cost, original_batch_date
       FROM inventory 
       WHERE location_id = $1 AND description = $2 AND unit = $3 AND quantity > 0
       ORDER BY original_batch_date DESC`,
      [locationId, description, unit]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get expiry batches for a specific item (for inventory display, transfers, and sales)
router.get('/expiry-batches/:locationId/:description/:unit', auth, async (req, res) => {
  try {
    const { locationId, description, unit } = req.params;

    const { hasLocationAccess } = require('../middleware/auth');
    const allowed = await hasLocationAccess(req.user.id, req.user.role, locationId);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const result = await pool.query(
      `SELECT id, 
              expiry_date, 
              quantity, 
              unit_cost,
              suggested_selling_price,
              batch_number,
              CASE 
                WHEN expiry_date IS NULL THEN 'NO_EXPIRY'
                WHEN expiry_date < CURRENT_DATE THEN 'EXPIRED'
                WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
                WHEN expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'EXPIRING_3_MONTHS'
                ELSE 'GOOD'
              END as expiry_status,
              CASE 
                WHEN expiry_date IS NULL THEN NULL
                ELSE expiry_date - CURRENT_DATE
              END as days_until_expiry
       FROM inventory 
       WHERE location_id = $1 AND description = $2 AND unit = $3 AND quantity > 0
       ORDER BY 
         CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
         expiry_date ASC NULLS LAST`,
      [locationId, description, unit]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get inventory for current user's location(s) - MAIN ROUTE
router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT i.*, l.name as location_name, l.type as location_type
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by user role
    if (req.user.role === 'branch_manager') {
      // Get all locations this manager has access to
      const { getManagerLocations } = require('../middleware/auth');
      const managerLocations = await getManagerLocations(req.user.id);
      const locationIds = managerLocations.map(l => l.id);
      
      if (locationIds.length > 0) {
        query += ` AND i.location_id = ANY($${paramCount})`;
        params.push(locationIds);
        paramCount++;
      } else {
        // Fallback to primary location if no branches assigned
        query += ` AND i.location_id = $${paramCount}`;
        params.push(req.user.location_id);
        paramCount++;
      }
    } else if (req.user.role === 'branch_staff') {
      query += ` AND i.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (req.user.role === 'warehouse') {
      query += ` AND i.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    }
    
    query += ' ORDER BY l.name, i.description, i.unit';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    const params = [];
    if (req.user.role === 'branch_manager') {
      const { getManagerLocations } = require('../middleware/auth');
      const managerLocations = await getManagerLocations(req.user.id, 'branch_manager');
      const locationIds = managerLocations.map(l => l.id);
      if (locationIds.length === 0) return res.json([]);
      query += ' AND i.location_id = ANY($1)';
      params.push(locationIds);
    } else if (req.user.role !== 'admin' && req.user.role !== 'audit' && req.user.location_id) {
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

    const params = [];
    if (req.user.role === 'branch_manager') {
      const { getManagerLocations } = require('../middleware/auth');
      const managerLocations = await getManagerLocations(req.user.id, 'branch_manager');
      const locationIds = managerLocations.map(l => l.id);
      if (locationIds.length === 0) return res.json([]);
      query += ' AND i.location_id = ANY($1)';
      params.push(locationIds);
    } else if (req.user.role !== 'admin' && req.user.role !== 'audit' && req.user.location_id) {
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
    const locationId = item.location_id;

    const { hasLocationAccess } = require('../middleware/auth');
    const allowed = await hasLocationAccess(req.user.id, req.user.role, locationId);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // All inventory batch row ids for this product (same description + unit at this
    // location). Audit-log lookups below key off these ids rather than the product
    // description text, so history still resolves after an item has been renamed.
    const idsResult = await pool.query(
      'SELECT id FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
      [locationId, item.description, item.unit]
    );
    const batchIds = idsResult.rows.map(r => r.id);

    // Items RECEIVED (transfers delivered TO this location) — same source as Inventory History
    const receivedResult = await pool.query(
      `SELECT
        'received' as type,
        t.id,
        COALESCE(t.transfer_date, t.created_at) as date,
        t.description,
        t.unit,
        t.quantity,
        t.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        fl.name as from_location_name,
        fl.type as from_location_type
      FROM transfers t
      JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE t.to_location_id = $1 AND t.status = 'delivered'
        AND t.description = $2 AND t.unit = $3
      ORDER BY COALESCE(t.transfer_date, t.created_at) DESC
      LIMIT 500`,
      [locationId, item.description, item.unit]
    );

    // Items TRANSFERRED OUT (delivered transfers FROM this location)
    const sentResult = await pool.query(
      `SELECT
        'transferred' as type,
        t.id,
        COALESCE(t.transfer_date, t.created_at) as date,
        t.description,
        t.unit,
        t.quantity,
        t.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        tl.name as to_location_name,
        tl.type as to_location_type
      FROM transfers t
      JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE t.from_location_id = $1 AND t.status = 'delivered'
        AND t.description = $2 AND t.unit = $3
      ORDER BY COALESCE(t.transfer_date, t.created_at) DESC
      LIMIT 500`,
      [locationId, item.description, item.unit]
    );

    // Standalone deliveries (no linked transfer) — source-side deduction at accept time.
    // Without this, admin-created deliveries don't appear in either location's history
    // even though stock moved. transfer_id IS NULL skips transfer-linked deliveries,
    // which are already covered by sentResult/receivedResult above.
    const sentDeliveriesResult = await pool.query(
      `SELECT
        'transferred' as type,
        d.id,
        COALESCE(d.delivered_date, d.updated_at, d.created_at) as date,
        di.description,
        di.unit,
        di.quantity,
        di.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        tl.name as to_location_name,
        tl.type as to_location_type
      FROM deliveries d
      JOIN delivery_items di ON d.id = di.delivery_id
      JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.from_location_id = $1 AND d.status = 'delivered'
        AND d.transfer_id IS NULL
        AND di.description = $2 AND di.unit = $3
      ORDER BY COALESCE(d.delivered_date, d.updated_at, d.created_at) DESC
      LIMIT 500`,
      [locationId, item.description, item.unit]
    );

    const receivedDeliveriesResult = await pool.query(
      `SELECT
        'received' as type,
        d.id,
        COALESCE(d.delivered_date, d.updated_at, d.created_at) as date,
        di.description,
        di.unit,
        di.quantity,
        di.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        fl.name as from_location_name,
        fl.type as from_location_type
      FROM deliveries d
      JOIN delivery_items di ON d.id = di.delivery_id
      JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.to_location_id = $1 AND d.status = 'delivered'
        AND d.transfer_id IS NULL
        AND di.description = $2 AND di.unit = $3
      ORDER BY COALESCE(d.delivered_date, d.updated_at, d.created_at) DESC
      LIMIT 500`,
      [locationId, item.description, item.unit]
    );

    // Items ADDED manually (from audit log)
    const addedResult = await pool.query(
      `SELECT
        'added' as type,
        al.id,
        al.created_at as date,
        al.new_values->>'description' as description,
        al.new_values->>'unit' as unit,
        al.new_values->>'quantity' as quantity,
        al.new_values->>'unit_cost' as unit_cost,
        al.username as by_who,
        al.description as audit_description
      FROM audit_log al
      WHERE al.table_name = 'inventory'
        AND al.action = 'INVENTORY_ADD'
        AND al.record_id = ANY($1::int[])
      ORDER BY al.created_at DESC
      LIMIT 500`,
      [batchIds]
    );

    // Fallback "created" entries: inventory batch rows that have no INVENTORY_ADD
    // audit record (e.g. created via delivery, import, transfer or unit conversion).
    // Without this, products not added through the manual "Add Inventory" form show
    // no history at all. We surface the row's own creation date and, where possible,
    // attribute it to whoever first touched the row in the audit log.
    const createdResult = await pool.query(
      `SELECT
        'added' as type,
        inv.id,
        inv.created_at as date,
        inv.description,
        inv.unit,
        inv.quantity,
        inv.unit_cost,
        COALESCE(
          (SELECT al2.username
             FROM audit_log al2
            WHERE al2.table_name = 'inventory'
              AND al2.record_id = inv.id
              AND al2.username IS NOT NULL
            ORDER BY al2.created_at ASC
            LIMIT 1),
          'System'
        ) as by_who,
        'Item created in inventory' as audit_description
      FROM inventory inv
      WHERE inv.id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.table_name = 'inventory'
            AND al.action = 'INVENTORY_ADD'
            AND al.record_id = inv.id
        )
      ORDER BY inv.created_at DESC
      LIMIT 500`,
      [batchIds]
    );

    // Items EDITED (from audit log) - admin and warehouse only
    const editedResult = await pool.query(
      `SELECT
        'edited' as type,
        al.id,
        al.created_at as date,
        al.new_values->>'description' as description,
        al.new_values->>'unit' as unit,
        al.old_values->>'quantity' as old_quantity,
        al.new_values->>'quantity' as quantity,
        al.old_values->>'unit_cost' as old_unit_cost,
        al.new_values->>'unit_cost' as unit_cost,
        al.old_values->>'suggested_selling_price' as old_suggested_selling_price,
        al.new_values->>'suggested_selling_price' as suggested_selling_price,
        al.username as by_who,
        al.description as audit_description,
        u.role as user_role
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.table_name = 'inventory'
        AND al.action = 'INVENTORY_UPDATE'
        AND al.record_id = ANY($1::int[])
      ORDER BY al.created_at DESC
      LIMIT 500`,
      [batchIds]
    );

    // Sales of this product at this location
    const salesResult = await pool.query(
      `SELECT
        'sale' as type,
        st.id,
        COALESCE(st.transaction_date, st.created_at) as date,
        st.item_description as description,
        st.item_unit as unit,
        st.quantity_sold as quantity,
        st.unit_price as unit_cost,
        st.total_amount,
        st.payment_method,
        st.customer_name,
        COALESCE(st.sold_by_name, 'Unknown') as by_who,
        l.name as location_name
      FROM sales_transactions st
      JOIN locations l ON st.location_id = l.id
      WHERE st.location_id = $1
        AND st.item_description = $2 AND st.item_unit = $3
      ORDER BY COALESCE(st.transaction_date, st.created_at) DESC
      LIMIT 500`,
      [locationId, item.description, item.unit]
    );

    // Unit conversions involving any of this product's batch rows. convert-units
    // logs a single UNIT_CONVERSION row (record_id = the "from" batch); the "to"
    // batch only appears inside new_values, so we match both sides. Without this,
    // stock created/increased purely through conversions shows no history at all.
    const conversionResult = await pool.query(
      `SELECT
        'converted' as type,
        al.id,
        al.created_at as date,
        CASE WHEN al.record_id = ANY($1::int[])
             THEN al.new_values->>'boxesToConvert'
             ELSE al.new_values->>'piecesToAdd' END as quantity,
        al.username as by_who,
        al.description as audit_description,
        CASE WHEN al.record_id = ANY($1::int[]) THEN 'out' ELSE 'in' END as conversion_direction
      FROM audit_log al
      WHERE al.table_name = 'inventory'
        AND al.action = 'UNIT_CONVERSION'
        AND (
          al.record_id = ANY($1::int[])
          OR (CASE WHEN al.new_values->>'toItemId' ~ '^[0-9]+$'
                   THEN (al.new_values->>'toItemId')::int END) = ANY($1::int[])
          OR (CASE WHEN al.new_values->>'fromItemId' ~ '^[0-9]+$'
                   THEN (al.new_values->>'fromItemId')::int END) = ANY($1::int[])
        )
      ORDER BY al.created_at DESC
      LIMIT 500`,
      [batchIds]
    );

    const allHistory = [
      ...receivedResult.rows,
      ...sentResult.rows,
      ...sentDeliveriesResult.rows,
      ...receivedDeliveriesResult.rows,
      ...addedResult.rows,
      ...createdResult.rows,
      ...editedResult.rows,
      ...salesResult.rows,
      ...conversionResult.rows
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(allHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get location-level receive/transfer/add history for a location
router.get('/location-history/:locationId', auth, async (req, res) => {
  try {
    const { locationId } = req.params;

    const { hasLocationAccess } = require('../middleware/auth');
    const allowed = await hasLocationAccess(req.user.id, req.user.role, locationId);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Items RECEIVED (transfers delivered TO this location)
    const receivedResult = await pool.query(
      `SELECT
        'received' as type,
        t.id,
        COALESCE(t.transfer_date, t.created_at) as date,
        t.description,
        t.unit,
        t.quantity,
        t.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        fl.name as from_location_name,
        fl.type as from_location_type
      FROM transfers t
      JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE t.to_location_id = $1 AND t.status = 'delivered'
      ORDER BY COALESCE(t.transfer_date, t.created_at) DESC
      LIMIT 500`,
      [locationId]
    );

    // Items TRANSFERRED OUT (transfers from this location that are delivered)
    const sentResult = await pool.query(
      `SELECT
        'transferred' as type,
        t.id,
        COALESCE(t.transfer_date, t.created_at) as date,
        t.description,
        t.unit,
        t.quantity,
        t.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        tl.name as to_location_name,
        tl.type as to_location_type
      FROM transfers t
      JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE t.from_location_id = $1 AND t.status = 'delivered'
      ORDER BY COALESCE(t.transfer_date, t.created_at) DESC
      LIMIT 500`,
      [locationId]
    );

    // Standalone deliveries (no linked transfer) — cover admin-created deliveries
    // that aren't reflected in the transfers table.
    const sentDeliveriesResult = await pool.query(
      `SELECT
        'transferred' as type,
        d.id,
        COALESCE(d.delivered_date, d.updated_at, d.created_at) as date,
        di.description,
        di.unit,
        di.quantity,
        di.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        tl.name as to_location_name,
        tl.type as to_location_type
      FROM deliveries d
      JOIN delivery_items di ON d.id = di.delivery_id
      JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.from_location_id = $1 AND d.status = 'delivered'
        AND d.transfer_id IS NULL
      ORDER BY COALESCE(d.delivered_date, d.updated_at, d.created_at) DESC
      LIMIT 500`,
      [locationId]
    );

    const receivedDeliveriesResult = await pool.query(
      `SELECT
        'received' as type,
        d.id,
        COALESCE(d.delivered_date, d.updated_at, d.created_at) as date,
        di.description,
        di.unit,
        di.quantity,
        di.unit_cost,
        COALESCE(u.full_name, 'Unknown') as by_who,
        fl.name as from_location_name,
        fl.type as from_location_type
      FROM deliveries d
      JOIN delivery_items di ON d.id = di.delivery_id
      JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.to_location_id = $1 AND d.status = 'delivered'
        AND d.transfer_id IS NULL
      ORDER BY COALESCE(d.delivered_date, d.updated_at, d.created_at) DESC
      LIMIT 500`,
      [locationId]
    );

    // Items ADDED manually by admin/staff
    const addedResult = await pool.query(
      `SELECT
        'added' as type,
        al.id,
        al.created_at as date,
        al.new_values->>'description' as description,
        al.new_values->>'unit' as unit,
        al.new_values->>'quantity' as quantity,
        al.new_values->>'unit_cost' as unit_cost,
        al.username as by_who,
        al.description as audit_description
      FROM audit_log al
      WHERE al.table_name = 'inventory'
        AND al.action = 'INVENTORY_ADD'
        AND (al.new_values->>'location_id')::integer = $1
      ORDER BY al.created_at DESC
      LIMIT 500`,
      [locationId]
    );

    const allHistory = [
      ...receivedResult.rows,
      ...sentResult.rows,
      ...sentDeliveriesResult.rows,
      ...receivedDeliveriesResult.rows,
      ...addedResult.rows
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(allHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Location Inventory Summary ─────────────────────────────────────────────
// Per-product BEG / RR / DR / OPEN BOTTLE / RETAIL / DISCREPANCY / SALES / END
// for a location over a date window. Powers the Inventory Summary report.
//
//   BEG          stock on hand just before `from`
//   RR           received from warehouse (deliveries / transfers IN), in window
//   DR           delivered out to other locations (deliveries / transfers OUT)
//   OPEN BOTTLE  units converted out of this unit (e.g. bottles opened)
//   RETAIL       units gained from conversion into this unit (e.g. pieces)
//   SALES        quantity sold
//   END          stock on hand at `to` (anchored to live inventory, rolled back
//                by tracked deltas dated after `to`)
//   DISCREPANCY  END − (BEG + RR − DR − OPEN + RETAIL − SALES); the over/short not
//                explained by tracked movements (manual adds / edits)
router.get('/summary/:locationId', auth, authorize('admin', 'audit', 'branch_manager', 'branch_staff', 'warehouse'), async (req, res) => {
  try {
    const locationId = parseInt(req.params.locationId);
    const { from, to, search } = req.query;

    if (!locationId) return res.status(400).json({ error: 'A location is required' });

    const { hasLocationAccess } = require('../middleware/auth');
    const allowed = await hasLocationAccess(req.user.id, req.user.role, locationId);
    if (!allowed) return res.status(403).json({ error: 'Access denied to this location' });

    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null;
    const toTs = to ? new Date(to + 'T23:59:59.999').getTime() : null;

    // Only events dated on/after `from` are needed: BEG is derived by rolling the
    // live END back through in-window deltas, so anything before `from` is implicit.
    const fromClause = from ? "AND $2::date <= ($EVDATE)::date" : '';
    const params = from ? [locationId, from] : [locationId];
    const q = (sql) => pool.query(sql, params);

    // Product metadata + current on-hand (depleted batches persist as 0-qty rows,
    // so grouping the live inventory captures every product ever stocked here).
    const meta = await pool.query(
      `SELECT i.description, i.unit,
              COALESCE(SUM(i.quantity), 0)              AS current_qty,
              MAX(i.suggested_selling_price)            AS selling_price,
              MAX(i.main_category)                      AS brand,
              MAX(uc.conversion_factor)                 AS content
         FROM inventory i
         LEFT JOIN unit_conversions uc
                ON uc.product_description = i.description AND uc.converted_unit = i.unit
        WHERE i.location_id = $1
        GROUP BY i.description, i.unit`,
      [locationId]
    );

    // Each query yields { description, unit, date, qty, category }.
    const received = await q(`
      SELECT t.description, t.unit, COALESCE(t.transfer_date, t.created_at) AS date,
             t.quantity AS qty, 'RR' AS category
        FROM transfers t
       WHERE t.to_location_id = $1 AND t.status = 'delivered'
       ${fromClause.replace('$EVDATE', 'COALESCE(t.transfer_date, t.created_at)')}
      UNION ALL
      SELECT di.description, di.unit, COALESCE(d.delivered_date, d.updated_at, d.created_at) AS date,
             di.quantity AS qty, 'RR' AS category
        FROM deliveries d JOIN delivery_items di ON di.delivery_id = d.id
       WHERE d.to_location_id = $1 AND d.status = 'delivered' AND d.transfer_id IS NULL
       ${fromClause.replace('$EVDATE', 'COALESCE(d.delivered_date, d.updated_at, d.created_at)')}
    `);

    const sent = await q(`
      SELECT t.description, t.unit, COALESCE(t.transfer_date, t.created_at) AS date,
             t.quantity AS qty, 'DR' AS category
        FROM transfers t
       WHERE t.from_location_id = $1 AND t.status = 'delivered'
       ${fromClause.replace('$EVDATE', 'COALESCE(t.transfer_date, t.created_at)')}
      UNION ALL
      SELECT di.description, di.unit, COALESCE(d.delivered_date, d.updated_at, d.created_at) AS date,
             di.quantity AS qty, 'DR' AS category
        FROM deliveries d JOIN delivery_items di ON di.delivery_id = d.id
       WHERE d.from_location_id = $1 AND d.status = 'delivered' AND d.transfer_id IS NULL
       ${fromClause.replace('$EVDATE', 'COALESCE(d.delivered_date, d.updated_at, d.created_at)')}
    `);

    const sales = await q(`
      SELECT st.item_description AS description, st.item_unit AS unit,
             COALESCE(st.transaction_date, st.created_at) AS date,
             st.quantity_sold AS qty, 'SALES' AS category
        FROM sales_transactions st
       WHERE st.location_id = $1
       ${fromClause.replace('$EVDATE', 'COALESCE(st.transaction_date, st.created_at)')}
    `);

    const convOut = await q(`
      SELECT inv.description, inv.unit, al.created_at AS date,
             (al.new_values->>'boxesToConvert') AS qty, 'OPEN' AS category
        FROM audit_log al
        JOIN inventory inv ON inv.id = al.record_id AND inv.location_id = $1
       WHERE al.table_name = 'inventory' AND al.action = 'UNIT_CONVERSION'
       ${fromClause.replace('$EVDATE', 'al.created_at')}
    `);

    const convIn = await q(`
      SELECT inv.description, inv.unit, al.created_at AS date,
             (al.new_values->>'piecesToAdd') AS qty, 'RETAIL' AS category
        FROM audit_log al
        JOIN inventory inv
          ON inv.location_id = $1
         AND (CASE WHEN al.new_values->>'toItemId' ~ '^[0-9]+$'
                   THEN (al.new_values->>'toItemId')::int END) = inv.id
       WHERE al.table_name = 'inventory' AND al.action = 'UNIT_CONVERSION'
       ${fromClause.replace('$EVDATE', 'al.created_at')}
    `);

    // Manual adjustments (adds + edits) — signed; surface as DISCREPANCY / over-short.
    const adds = await q(`
      SELECT inv.description, inv.unit, al.created_at AS date,
             (al.new_values->>'quantity') AS qty, 'ADJ' AS category
        FROM audit_log al
        JOIN inventory inv ON inv.id = al.record_id AND inv.location_id = $1
       WHERE al.table_name = 'inventory' AND al.action = 'INVENTORY_ADD'
       ${fromClause.replace('$EVDATE', 'al.created_at')}
    `);

    const edits = await q(`
      SELECT inv.description, inv.unit, al.created_at AS date,
             (COALESCE((al.new_values->>'quantity')::numeric, 0)
              - COALESCE((al.old_values->>'quantity')::numeric, 0)) AS qty, 'ADJ' AS category
        FROM audit_log al
        JOIN inventory inv ON inv.id = al.record_id AND inv.location_id = $1
       WHERE al.table_name = 'inventory' AND al.action = 'INVENTORY_UPDATE'
       ${fromClause.replace('$EVDATE', 'al.created_at')}
    `);

    const SIGN = { RR: 1, RETAIL: 1, DR: -1, SALES: -1, OPEN: -1, ADJ: 1 };
    const events = [
      ...received.rows, ...sent.rows, ...sales.rows,
      ...convOut.rows, ...convIn.rows, ...adds.rows, ...edits.rows,
    ];

    // Bucket events per product.
    const byProduct = new Map();
    const keyOf = (d, u) => `${d}||${u}`;
    for (const e of events) {
      const k = keyOf(e.description, e.unit);
      if (!byProduct.has(k)) byProduct.set(k, []);
      byProduct.get(k).push(e);
    }

    const searchLower = (search || '').trim().toLowerCase();

    const rows = meta.rows
      .filter(m => !searchLower || m.description.toLowerCase().includes(searchLower))
      .map(m => {
        const evs = byProduct.get(keyOf(m.description, m.unit)) || [];
        const currentQty = parseFloat(m.current_qty) || 0;

        let rr = 0, dr = 0, openBottle = 0, retail = 0, salesQty = 0, adj = 0;
        let deltaAfter = 0; // signed sum of everything dated after `to`

        for (const e of evs) {
          const ts = new Date(e.date).getTime();
          const qty = parseFloat(e.qty) || 0;
          const signed = qty * (SIGN[e.category] || 0);

          if (toTs !== null && ts > toTs) { deltaAfter += signed; continue; }
          if (fromTs !== null && ts < fromTs) continue; // guarded by SQL, belt-and-braces

          switch (e.category) {
            case 'RR': rr += qty; break;
            case 'DR': dr += qty; break;
            case 'SALES': salesQty += qty; break;
            case 'OPEN': openBottle += qty; break;
            case 'RETAIL': retail += qty; break;
            case 'ADJ': adj += qty; break; // already signed
            default: break;
          }
        }

        const end = currentQty - deltaAfter;
        const windowSigned = rr - dr - openBottle + retail - salesQty + adj;
        const beg = end - windowSigned;
        const discrepancy = adj; // == end - (beg + rr - dr - openBottle + retail - salesQty)

        return {
          description: m.description,
          unit: m.unit,
          brand: m.brand || '',
          content: m.content != null ? parseFloat(m.content) : null,
          selling_price: m.selling_price != null ? parseFloat(m.selling_price) : null,
          beg, rr, dr, open_bottle: openBottle, retail, discrepancy, sales: salesQty, end,
        };
      })
      .sort((a, b) => a.description.localeCompare(b.description));

    res.json({
      location_id: locationId,
      from: from || null,
      to: to || null,
      items: rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
