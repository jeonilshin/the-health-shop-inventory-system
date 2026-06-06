const router = require('express').Router();
const pool = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT uc.*, p.name as product_name, p.unit as base_unit
       FROM unit_conversions uc JOIN products p ON uc.product_id = p.id
       ORDER BY p.name, uc.from_unit, uc.to_unit`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/product/:productId', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT uc.*, p.name as product_name, p.unit as base_unit
       FROM unit_conversions uc JOIN products p ON uc.product_id = p.id
       WHERE uc.product_id = $1 ORDER BY uc.from_unit, uc.to_unit`,
      [req.params.productId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { product_id, from_unit, to_unit, factor } = req.body;
    if (!product_id || !from_unit || !to_unit || !factor) {
      return res.status(400).json({ error: 'product_id, from_unit, to_unit, factor required' });
    }
    if (parseFloat(factor) <= 0) return res.status(400).json({ error: 'factor must be > 0' });
    if (from_unit === to_unit) return res.status(400).json({ error: 'from_unit and to_unit cannot be the same' });

    const result = await pool.query(
      `INSERT INTO unit_conversions (product_id, from_unit, to_unit, factor)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (product_id, from_unit, to_unit)
       DO UPDATE SET factor = EXCLUDED.factor, updated_at = NOW()
       RETURNING *`,
      [product_id, from_unit.trim(), to_unit.trim(), parseFloat(factor)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { factor } = req.body;
    if (!factor || parseFloat(factor) <= 0) return res.status(400).json({ error: 'factor must be > 0' });

    const result = await pool.query(
      'UPDATE unit_conversions SET factor = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [parseFloat(factor), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Conversion not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM unit_conversions WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
