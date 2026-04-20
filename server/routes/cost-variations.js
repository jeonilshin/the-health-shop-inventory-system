const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

// Get all cost variations (admin only)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { description, unit, is_active } = req.query;
    
    let query = `
      SELECT cv.*, 
             u.full_name as created_by_name,
             COUNT(DISTINCT i.location_id) as locations_using
      FROM cost_variations cv
      LEFT JOIN users u ON cv.created_by = u.id
      LEFT JOIN inventory i ON cv.description = i.description 
        AND cv.unit = i.unit 
        AND cv.unit_cost = i.unit_cost
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (description) {
      query += ` AND cv.description ILIKE $${paramCount}`;
      params.push(`%${description}%`);
      paramCount++;
    }
    
    if (unit) {
      query += ` AND cv.unit = $${paramCount}`;
      params.push(unit);
      paramCount++;
    }
    
    if (is_active !== undefined) {
      query += ` AND cv.is_active = $${paramCount}`;
      params.push(is_active === 'true');
      paramCount++;
    }
    
    query += ` GROUP BY cv.id, u.full_name ORDER BY cv.description, cv.cost_point_name`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cost variations for a specific item
router.get('/item/:description/:unit', auth, async (req, res) => {
  try {
    const { description, unit } = req.params;
    
    const result = await pool.query(`
      SELECT cv.*,
             u.full_name as created_by_name,
             COUNT(DISTINCT i.location_id) as locations_using
      FROM cost_variations cv
      LEFT JOIN users u ON cv.created_by = u.id
      LEFT JOIN inventory i ON cv.description = i.description 
        AND cv.unit = i.unit 
        AND cv.unit_cost = i.unit_cost
      WHERE cv.description = $1 AND cv.unit = $2
      GROUP BY cv.id, u.full_name
      ORDER BY cv.cost_point_name
    `, [description, unit]);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get summary of all items with their cost variations
router.get('/summary', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cv.description,
        cv.unit,
        COUNT(DISTINCT cv.id) as cost_point_count,
        MIN(cv.unit_cost) as min_cost,
        MAX(cv.unit_cost) as max_cost,
        AVG(cv.unit_cost) as avg_cost,
        MIN(cv.suggested_selling_price) as min_selling_price,
        MAX(cv.suggested_selling_price) as max_selling_price,
        json_agg(
          json_build_object(
            'cost_point_name', cv.cost_point_name,
            'unit_cost', cv.unit_cost,
            'suggested_selling_price', cv.suggested_selling_price,
            'is_active', cv.is_active
          ) ORDER BY cv.unit_cost
        ) as cost_points
      FROM cost_variations cv
      WHERE cv.is_active = true
      GROUP BY cv.description, cv.unit
      ORDER BY cv.description, cv.unit
    `);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get inventory by location for a specific item (shows cost distribution across locations)
router.get('/inventory-by-location/:description/:unit', auth, authorize('admin'), async (req, res) => {
  try {
    const { description, unit } = req.params;
    
    const result = await pool.query(`
      SELECT 
        l.id as location_id,
        l.name as location_name,
        l.type as location_type,
        i.unit_cost,
        i.suggested_selling_price,
        SUM(i.quantity) as total_quantity,
        COUNT(DISTINCT i.id) as batch_count,
        MIN(i.expiry_date) as earliest_expiry,
        MAX(i.expiry_date) as latest_expiry,
        json_agg(
          json_build_object(
            'id', i.id,
            'quantity', i.quantity,
            'expiry_date', i.expiry_date,
            'batch_number', i.batch_number
          ) ORDER BY i.expiry_date NULLS LAST
        ) as batches
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      WHERE i.description = $1 AND i.unit = $2 AND i.quantity > 0
      GROUP BY l.id, l.name, l.type, i.unit_cost, i.suggested_selling_price
      ORDER BY l.type DESC, l.name, i.unit_cost
    `, [decodeURIComponent(description), decodeURIComponent(unit)]);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create cost variation (admin only)
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { 
      description, 
      unit, 
      cost_point_name, 
      unit_cost, 
      suggested_selling_price 
    } = req.body;
    
    // Validate required fields
    if (!description || !unit || !cost_point_name || !unit_cost) {
      return res.status(400).json({ 
        error: 'Description, unit, cost point name, and unit cost are required' 
      });
    }
    
    const result = await pool.query(`
      INSERT INTO cost_variations 
        (description, unit, cost_point_name, unit_cost, suggested_selling_price, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      description, 
      unit, 
      cost_point_name, 
      unit_cost, 
      suggested_selling_price || unit_cost,
      req.user.id
    ]);
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'COST_VARIATION_CREATE',
      tableName: 'cost_variations',
      recordId: result.rows[0].id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Created cost variation: ${description} - ${cost_point_name}`
    });
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ 
        error: 'A cost variation with this name already exists for this item' 
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update cost variation (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      cost_point_name, 
      unit_cost, 
      suggested_selling_price, 
      is_active 
    } = req.body;
    
    // Get old values for audit
    const oldData = await pool.query(
      'SELECT * FROM cost_variations WHERE id = $1', 
      [id]
    );
    
    if (oldData.rows.length === 0) {
      return res.status(404).json({ error: 'Cost variation not found' });
    }
    
    const result = await pool.query(`
      UPDATE cost_variations 
      SET 
        cost_point_name = COALESCE($1, cost_point_name),
        unit_cost = COALESCE($2, unit_cost),
        suggested_selling_price = COALESCE($3, suggested_selling_price),
        is_active = COALESCE($4, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [cost_point_name, unit_cost, suggested_selling_price, is_active, id]);
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'COST_VARIATION_UPDATE',
      tableName: 'cost_variations',
      recordId: id,
      oldValues: oldData.rows[0],
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated cost variation: ${result.rows[0].description} - ${result.rows[0].cost_point_name}`
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete cost variation (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if any inventory is using this cost
    const inventoryCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM inventory i
      JOIN cost_variations cv ON i.description = cv.description 
        AND i.unit = cv.unit 
        AND i.unit_cost = cv.unit_cost
      WHERE cv.id = $1
    `, [id]);
    
    if (parseInt(inventoryCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete cost variation that is currently in use in inventory. Deactivate it instead.' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM cost_variations WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cost variation not found' });
    }
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'COST_VARIATION_DELETE',
      tableName: 'cost_variations',
      recordId: id,
      oldValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted cost variation: ${result.rows[0].description} - ${result.rows[0].cost_point_name}`
    });
    
    res.json({ message: 'Cost variation deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
