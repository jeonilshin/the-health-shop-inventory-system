const router = require('express').Router();
const pool = require('../config/db');
const { auth, getManagerLocationIds } = require('../middleware/auth');

const getAccessibleLocationIds = async (user) => {
  if (['admin', 'audit'].includes(user.role)) return null;
  if (user.role === 'warehouse') return [user.location_id];
  if (user.role === 'staff') return [user.location_id];
  if (user.role === 'manager') {
    const ids = await getManagerLocationIds(user.id);
    if (user.location_id) ids.push(user.location_id);
    return ids;
  }
  return null;
};

router.get('/inventory', auth, async (req, res) => {
  try {
    const locIds = await getAccessibleLocationIds(req.user);
    let where = 'WHERE i.quantity > 0';
    let params = [];
    if (locIds) { where += ' AND i.location_id = ANY($1)'; params = [locIds]; }
    else if (req.query.location_id) { where += ' AND i.location_id = $1'; params = [req.query.location_id]; }

    const result = await pool.query(
      `SELECT p.name as product_name, p.unit, l.name as location_name, l.type as location_type,
              SUM(i.quantity) as total_quantity, COUNT(i.id) as batches_count,
              MIN(i.expiry_date) as oldest_expiry, SUM(i.quantity * COALESCE(i.unit_cost, 0)) as total_value
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       JOIN locations l ON i.location_id = l.id
       ${where}
       GROUP BY p.id, p.name, p.unit, l.id, l.name, l.type
       ORDER BY l.name, p.name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sales', auth, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const locIds = await getAccessibleLocationIds(req.user);

    let conditions = ["s.status = 'completed'"];
    let params = [];
    let idx = 1;

    if (locIds) { conditions.push(`s.location_id = ANY($${idx})`); params.push(locIds); idx++; }
    else if (req.query.location_id) { conditions.push(`s.location_id = $${idx}`); params.push(req.query.location_id); idx++; }
    if (from_date) { conditions.push(`s.created_at >= $${idx}`); params.push(from_date); idx++; }
    if (to_date) { conditions.push(`s.created_at <= $${idx}::date + interval '1 day'`); params.push(to_date); idx++; }

    const where = 'WHERE ' + conditions.join(' AND ');

    const result = await pool.query(
      `SELECT l.name as location_name,
              DATE(s.created_at) as date,
              COUNT(s.id) as total_sales,
              SUM(s.total_amount) as total_revenue,
              COALESCE(SUM(item_costs.cost), 0) as total_cost,
              SUM(s.total_amount) - COALESCE(SUM(item_costs.cost), 0) as profit
       FROM sales s
       JOIN locations l ON s.location_id = l.id
       LEFT JOIN LATERAL (
         SELECT s2.id as sale_id, SUM(si.quantity * COALESCE(si.unit_cost, 0)) as cost
         FROM sales s2
         JOIN sale_items si ON si.sale_id = s2.id
         WHERE s2.id = s.id
         GROUP BY s2.id
       ) item_costs ON item_costs.sale_id = s.id
       ${where}
       GROUP BY l.name, DATE(s.created_at)
       ORDER BY DATE(s.created_at) DESC, l.name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sales-summary', auth, async (req, res) => {
  try {
    const locIds = await getAccessibleLocationIds(req.user);
    let conditions = [];
    let params = [];
    let idx = 1;
    if (locIds) { conditions.push(`s.location_id = ANY($${idx})`); params.push(locIds); idx++; }
    else if (req.query.location_id) { conditions.push(`s.location_id = $${idx}`); params.push(req.query.location_id); idx++; }
    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await pool.query(
      `SELECT
         COUNT(CASE WHEN s.status = 'completed' THEN 1 END)::int AS total_transactions,
         COALESCE(SUM(CASE WHEN s.status = 'completed'
           THEN s.total_amount - COALESCE(s.discount_amount, 0) ELSE 0 END), 0) AS total_revenue,
         COUNT(CASE WHEN s.status = 'completed' THEN 1 END)::int AS items_sold,
         COUNT(CASE WHEN s.status = 'cancel_requested' THEN 1 END)::int AS cancel_requests
       FROM sales s
       JOIN locations l ON s.location_id = l.id
       ${where}`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transfers', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) as count FROM transfers GROUP BY status`
    );
    const counts = {};
    result.rows.forEach(r => { counts[r.status] = parseInt(r.count); });
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/low-stock', auth, async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 10;
    const locIds = await getAccessibleLocationIds(req.user);

    let params = [threshold];
    let locationFilter = '';
    if (locIds) { locationFilter = 'AND i.location_id = ANY($2)'; params.push(locIds); }

    const result = await pool.query(
      `SELECT p.name as product_name, p.unit, l.name as location_name,
              SUM(i.quantity) as total_qty
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       JOIN locations l ON i.location_id = l.id
       WHERE i.quantity > 0 ${locationFilter}
       GROUP BY p.id, p.name, p.unit, l.id, l.name
       HAVING SUM(i.quantity) < $1
       ORDER BY SUM(i.quantity) ASC, l.name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/expiring', auth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const locIds = await getAccessibleLocationIds(req.user);

    let where = `WHERE i.expiry_date IS NOT NULL AND i.expiry_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL AND i.quantity > 0`;
    let params = [days];

    if (locIds) { where += ` AND i.location_id = ANY($2)`; params.push(locIds); }

    const result = await pool.query(
      `SELECT p.name as product_name, p.unit, l.name as location_name,
              i.quantity, i.batch_number, i.expiry_date,
              (i.expiry_date - CURRENT_DATE) as days_until_expiry
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       JOIN locations l ON i.location_id = l.id
       ${where}
       ORDER BY i.expiry_date ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
