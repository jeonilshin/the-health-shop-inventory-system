const router = require('express').Router();
const pool = require('../config/db');
const { auth, getManagerLocationIds } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { action_type, product_id, from_date, to_date, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let locationIds = null;
    if (req.user.role === 'staff') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'warehouse') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'manager') {
      locationIds = await getManagerLocationIds(req.user.id);
      if (req.user.location_id) locationIds.push(req.user.location_id);
    } else if (req.query.location_id) {
      locationIds = [parseInt(req.query.location_id)];
    }

    let conditions = [];
    let params = [];
    let idx = 1;

    if (locationIds) {
      conditions.push(`(a.location_id = ANY($${idx}) OR a.location_id IS NULL)`);
      params.push(locationIds);
      idx++;
    }
    if (action_type && action_type !== 'all') {
      conditions.push(`a.action_type = $${idx}`);
      params.push(action_type);
      idx++;
    }
    if (product_id) {
      conditions.push(`a.product_id = $${idx}`);
      params.push(product_id);
      idx++;
    }
    if (from_date) {
      conditions.push(`a.created_at >= $${idx}`);
      params.push(from_date);
      idx++;
    }
    if (to_date) {
      conditions.push(`a.created_at <= $${idx}::date + interval '1 day'`);
      params.push(to_date);
      idx++;
    }
    if (search) {
      conditions.push(`(a.performer_name ILIKE $${idx} OR a.product_name ILIKE $${idx} OR a.location_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM activity_log a ${where}`,
      params
    );

    const result = await pool.query(
      `SELECT a.id, a.action_type, a.performer_name, a.performer_role,
              a.location_name, a.product_name,
              a.quantity_before, a.quantity_after, a.quantity_change,
              a.unit_cost, a.details, a.created_at,
              a.reference_type, a.reference_id
       FROM activity_log a
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Product-specific history timeline
router.get('/product/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    let locationIds = null;
    if (req.user.role === 'staff') locationIds = [req.user.location_id];
    else if (req.user.role === 'warehouse') locationIds = [req.user.location_id];
    else if (req.user.role === 'manager') {
      locationIds = await getManagerLocationIds(req.user.id);
      if (req.user.location_id) locationIds.push(req.user.location_id);
    }

    let conditions = ['a.product_id = $1'];
    let params = [productId];
    let idx = 2;

    if (locationIds) {
      conditions.push(`(a.location_id = ANY($${idx}) OR a.location_id IS NULL)`);
      params.push(locationIds);
      idx++;
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const result = await pool.query(
      `SELECT a.id, a.action_type, a.performer_name, a.performer_role,
              a.location_name, a.product_name,
              a.quantity_before, a.quantity_after, a.quantity_change,
              a.unit_cost, a.details, a.created_at,
              a.reference_type, a.reference_id
       FROM activity_log a
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
