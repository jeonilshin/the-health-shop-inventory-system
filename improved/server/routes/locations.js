const router = require('express').Router();
const pool = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT type, COUNT(*) as count FROM locations WHERE is_active = true GROUP BY type"
    );
    const stats = { branches: 0, warehouses: 0 };
    for (const row of result.rows) {
      if (row.type === 'branch') stats.branches = parseInt(row.count);
      if (row.type === 'warehouse' || row.type === 'main') stats.warehouses += parseInt(row.count);
    }
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations WHERE is_active = true ORDER BY type DESC, name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, type, address } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type required' });
    if (!['warehouse', 'branch'].includes(type)) return res.status(400).json({ error: 'type must be warehouse or branch' });
    const result = await pool.query(
      'INSERT INTO locations (name, type, address) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), type, address || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, address } = req.body;
    const result = await pool.query(
      'UPDATE locations SET name = COALESCE($1, name), address = COALESCE($2, address) WHERE id = $3 RETURNING *',
      [name, address, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users WHERE location_id = $1 AND is_active = true', [req.params.id]);
    if (parseInt(users.rows[0].count) > 0) return res.status(400).json({ error: 'Cannot delete location with active users' });
    await pool.query('UPDATE locations SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Location deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
