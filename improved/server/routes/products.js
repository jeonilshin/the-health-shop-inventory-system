const router = require('express').Router();
const pool = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE is_active = true ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, authorize('admin', 'warehouse'), async (req, res) => {
  try {
    const { name, unit, category, description } = req.body;
    if (!name || !unit) return res.status(400).json({ error: 'name and unit required' });
    const result = await pool.query(
      'INSERT INTO products (name, unit, category, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), unit.trim(), category || null, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, authorize('admin', 'warehouse'), async (req, res) => {
  try {
    const { name, unit, category, description } = req.body;
    const result = await pool.query(
      `UPDATE products SET name = COALESCE($1, name), unit = COALESCE($2, unit),
       category = COALESCE($3, category), description = COALESCE($4, description), updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, unit, category, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE products SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
