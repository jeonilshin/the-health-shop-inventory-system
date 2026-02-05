const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Get all locations
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY type, name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create location (admin only)
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, type, address, contact_number } = req.body;
    const result = await pool.query(
      'INSERT INTO locations (name, type, address, contact_number) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, type, address, contact_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
