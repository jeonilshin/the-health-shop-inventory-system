const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Record sale
router.post('/', auth, authorize('admin', 'branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { location_id, description, unit, quantity, selling_price, customer_name, notes } = req.body;
    
    // Check if user has access to this location
    if (req.user.role !== 'admin' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    await client.query('BEGIN');

    // Get inventory
    const inventory = await client.query(
      'SELECT * FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
      [location_id, description, unit]
    );

    if (inventory.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found in inventory' });
    }

    if (inventory.rows[0].quantity < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient quantity in stock' });
    }

    const total_amount = quantity * selling_price;

    // Remove from inventory
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE location_id = $2 AND description = $3 AND unit = $4',
      [quantity, location_id, description, unit]
    );

    // Record sale
    const sale = await client.query(
      `INSERT INTO sales (location_id, inventory_id, description, unit, quantity, unit_cost, selling_price, total_amount, sold_by, customer_name, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [location_id, inventory.rows[0].id, description, unit, quantity, inventory.rows[0].unit_cost, selling_price, total_amount, req.user.id, customer_name, notes]
    );

    await client.query('COMMIT');
    res.status(201).json(sale.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get sales history
router.get('/', auth, async (req, res) => {
  try {
    const { location_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT s.*, 
             l.name as location_name,
             u.full_name as sold_by_name
      FROM sales s
      LEFT JOIN locations l ON s.location_id = l.id
      LEFT JOIN users u ON s.sold_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (location_id) {
      query += ` AND s.location_id = $${paramCount}`;
      params.push(location_id);
      paramCount++;
    }

    if (start_date) {
      query += ` AND s.sale_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND s.sale_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ' ORDER BY s.sale_date DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
