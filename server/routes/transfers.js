const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Create transfer (warehouse to branch or branch to branch)
router.post('/', auth, authorize('admin', 'warehouse', 'branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { from_location_id, to_location_id, description, unit, quantity, unit_cost, notes } = req.body;
    
    // Check if user has access to from_location
    if (req.user.role !== 'admin' && req.user.location_id != from_location_id) {
      return res.status(403).json({ error: 'Access denied to source location' });
    }

    await client.query('BEGIN');

    // Get inventory from source location
    const sourceInventory = await client.query(
      'SELECT * FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
      [from_location_id, description, unit]
    );

    if (sourceInventory.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found in source location' });
    }

    if (sourceInventory.rows[0].quantity < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient quantity in source location' });
    }

    // Remove from source location
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE location_id = $2 AND description = $3 AND unit = $4',
      [quantity, from_location_id, description, unit]
    );

    // Add to destination location
    await client.query(
      `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, suggested_selling_price) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (location_id, description, unit) 
       DO UPDATE SET quantity = inventory.quantity + $4, updated_at = CURRENT_TIMESTAMP`,
      [to_location_id, description, unit, quantity, unit_cost, sourceInventory.rows[0].suggested_selling_price]
    );

    // Record transfer
    const transfer = await client.query(
      `INSERT INTO transfers (from_location_id, to_location_id, description, unit, quantity, unit_cost, transferred_by, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [from_location_id, to_location_id, description, unit, quantity, unit_cost, req.user.id, notes]
    );

    await client.query('COMMIT');
    res.status(201).json(transfer.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get transfer history
router.get('/', auth, async (req, res) => {
  try {
    const { from_location_id, to_location_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT t.*, 
             fl.name as from_location_name, 
             tl.name as to_location_name,
             u.full_name as transferred_by_name
      FROM transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (from_location_id) {
      query += ` AND t.from_location_id = $${paramCount}`;
      params.push(from_location_id);
      paramCount++;
    }

    if (to_location_id) {
      query += ` AND t.to_location_id = $${paramCount}`;
      params.push(to_location_id);
      paramCount++;
    }

    if (start_date) {
      query += ` AND t.transfer_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND t.transfer_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ' ORDER BY t.transfer_date DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
