const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Get all users (admin only)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.role, u.location_id, 
             l.name as location_name, u.created_at
      FROM users u
      LEFT JOIN locations l ON u.location_id = l.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user (admin only)
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { username, password, full_name, role, location_id } = req.body;

    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, password, full_name, role, location_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name, role, location_id',
      [username, hashedPassword, full_name, role, location_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, full_name, role, location_id, password } = req.body;

    let query;
    let params;

    if (password) {
      // If password is being updated
      const hashedPassword = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET username = $1, full_name = $2, role = $3, location_id = $4, password = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING id, username, full_name, role, location_id';
      params = [username, full_name, role, location_id || null, hashedPassword, id];
    } else {
      // Update without password
      query = 'UPDATE users SET username = $1, full_name = $2, role = $3, location_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, username, full_name, role, location_id';
      params = [username, full_name, role, location_id || null, id];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
