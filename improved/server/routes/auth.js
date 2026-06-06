const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

const logActivity = async (client, data) => {
  try {
    await client.query(
      `INSERT INTO activity_log (action_type, performed_by, performer_name, performer_role, location_id, location_name, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [data.action_type, data.performed_by, data.performer_name, data.performer_role,
       data.location_id || null, data.location_name || null, JSON.stringify(data.details || {})]
    );
  } catch (e) { console.error('Activity log error:', e.message); }
};

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const result = await pool.query(
      `SELECT u.*, l.name as location_name FROM users u
       LEFT JOIN locations l ON u.location_id = l.id
       WHERE u.username = $1 AND u.is_active = true`,
      [username.trim().toLowerCase()]
    );

    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    try { await pool.query('UPDATE thehealthshop.users SET updated_at = NOW() WHERE id = $1', [user.id]); } catch (_) { /* view — ignore */ }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    await logActivity(pool, {
      action_type: 'user_login',
      performed_by: user.id,
      performer_name: user.full_name,
      performer_role: user.role,
      location_id: user.location_id,
      location_name: user.location_name,
      details: { username: user.username }
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        location_id: user.location_id,
        location_name: user.location_name,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.location_id, u.last_login,
              l.name as location_name, l.type as location_type
       FROM users u LEFT JOIN locations l ON u.location_id = l.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE thehealthshop.users SET password = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
