const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, authorize('admin', 'audit'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.location_id, u.is_active, u.created_at, u.last_login,
              l.name as location_name
       FROM users u LEFT JOIN locations l ON u.location_id = l.id
       ORDER BY u.role, u.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { username, password, full_name, role, location_id } = req.body;
    if (!username || !password || !full_name || !role) return res.status(400).json({ error: 'username, password, full_name, role are required' });
    if (!['admin','warehouse','manager','staff','audit'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, location_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name, role, location_id, is_active`,
      [username.trim().toLowerCase(), hash, full_name.trim(), role, location_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { full_name, role, location_id, is_active, password } = req.body;
    const { id } = req.params;

    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    }

    // Build update fields dynamically to only touch what's provided
    const updates = [];
    const vals = [];
    let vi = 1;
    if (full_name !== undefined) { updates.push(`full_name = $${vi++}`); vals.push(full_name); }
    if (role !== undefined) { updates.push(`role = $${vi++}`); vals.push(role); }
    if ('location_id' in req.body) { updates.push(`location_id = $${vi++}`); vals.push(location_id || null); }
    if (is_active !== undefined) { updates.push(`is_active = $${vi++}`); vals.push(is_active); }
    if (updates.length === 0 && !password) return res.status(400).json({ error: 'No fields to update' });

    const result = updates.length > 0 ? await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${vi} RETURNING id, username, full_name, role, location_id, is_active`,
      [...vals, id]
    ) : await pool.query(
      'SELECT id, username, full_name, role, location_id, is_active FROM users WHERE id = $1', [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/branches', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.name, l.type, mb.assigned_at
       FROM manager_branches mb JOIN locations l ON mb.location_id = l.id
       WHERE mb.manager_id = $1 ORDER BY l.name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/branches', auth, authorize('admin'), async (req, res) => {
  try {
    const { location_id } = req.body;
    await pool.query(
      'INSERT INTO manager_branches (manager_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, location_id]
    );
    res.json({ message: 'Branch assigned' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/branches/:locationId', auth, authorize('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM manager_branches WHERE manager_id = $1 AND location_id = $2', [req.params.id, req.params.locationId]);
    res.json({ message: 'Branch removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
