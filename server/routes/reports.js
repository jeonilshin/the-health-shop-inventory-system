const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

// Inventory summary by location
router.get('/inventory-summary', auth, async (req, res) => {
  try {
    let query = `
      SELECT 
        l.id as location_id,
        l.name as location_name,
        l.type as location_type,
        COUNT(i.id) as total_items,
        COALESCE(SUM(i.quantity), 0) as total_quantity,
        COALESCE(SUM(i.quantity * i.unit_cost), 0) as total_value
      FROM locations l
      LEFT JOIN inventory i ON l.id = i.location_id
    `;
    
    const params = [];
    
    // Branch managers can only see their own branch
    if (req.user.role === 'branch_manager' || req.user.role === 'branch_staff') {
      query += ' WHERE l.id = $1';
      params.push(req.user.location_id);
    }
    
    query += ' GROUP BY l.id, l.name, l.type ORDER BY l.type, l.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sales report
router.get('/sales-summary', auth, async (req, res) => {
  try {
    const { start_date, end_date, location_id } = req.query;
    
    let query = `
      SELECT 
        l.id as location_id,
        l.name as location_name,
        COUNT(s.id) as total_transactions,
        COALESCE(SUM(s.quantity), 0) as total_items_sold,
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COALESCE(SUM(s.quantity * s.unit_cost), 0) as total_cost,
        COALESCE(SUM(s.total_amount - (s.quantity * s.unit_cost)), 0) as total_profit
      FROM locations l
      LEFT JOIN sales s ON l.id = s.location_id
      WHERE l.type = 'branch'
    `;
    const params = [];
    let paramCount = 1;

    // Branch managers can only see their own branch
    if (req.user.role === 'branch_manager' || req.user.role === 'branch_staff') {
      query += ` AND l.id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (location_id) {
      query += ` AND l.id = $${paramCount}`;
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

    query += ' GROUP BY l.id, l.name ORDER BY total_revenue DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Low stock alert
router.get('/low-stock', auth, async (req, res) => {
  try {
    const { threshold = 10 } = req.query;
    
    let query = `
      SELECT 
        i.*,
        l.name as location_name,
        l.type as location_type
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      WHERE i.quantity <= $1
    `;
    
    const params = [threshold];
    
    // Branch managers can only see their own branch
    if (req.user.role === 'branch_manager' || req.user.role === 'branch_staff') {
      query += ' AND i.location_id = $2';
      params.push(req.user.location_id);
    }
    
    query += ' ORDER BY i.quantity ASC, l.name';
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
