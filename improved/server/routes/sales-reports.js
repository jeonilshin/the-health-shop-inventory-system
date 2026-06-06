const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

const canManage = (role) => ['admin', 'manager'].includes(role);
const canSubmit = (role) => ['admin', 'manager', 'staff', 'warehouse'].includes(role);
const n = (v) => parseFloat(v) || 0;

// GET /api/sales-reports/counts
router.get('/counts', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT location_id, COUNT(*) as count FROM sales_reports GROUP BY location_id`
    );
    const counts = {};
    result.rows.forEach(r => { counts[r.location_id] = parseInt(r.count); });
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales-reports
router.get('/', auth, async (req, res) => {
  try {
    const { location_id, type, status, startDate, endDate } = req.query;
    const u = req.user;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (u.role === 'admin' || u.role === 'audit') {
      if (location_id) { conditions.push(`sr.location_id = $${idx}`); params.push(location_id); idx++; }
    } else {
      conditions.push(`sr.location_id = $${idx}`);
      params.push(u.location_id);
      idx++;
    }

    if (type) { conditions.push(`sr.report_type = $${idx}`); params.push(type); idx++; }
    if (status) { conditions.push(`sr.status = $${idx}`); params.push(status); idx++; }
    if (startDate) { conditions.push(`sr.report_date >= $${idx}`); params.push(startDate); idx++; }
    if (endDate) { conditions.push(`sr.report_date <= $${idx}`); params.push(endDate); idx++; }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await pool.query(
      `SELECT sr.*, l.name as location_name, l.type as location_type,
              u.full_name as submitted_by_full_name,
              r.full_name as reviewed_by_full_name
       FROM sales_reports sr
       JOIN locations l ON sr.location_id = l.id
       LEFT JOIN users u ON sr.submitted_by = u.id
       LEFT JOIN users r ON sr.reviewed_by = r.id
       ${where}
       ORDER BY sr.report_date DESC, l.name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales-reports/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sr.*, l.name as location_name, l.type as location_type,
              u.full_name as submitted_by_full_name,
              r.full_name as reviewed_by_full_name
       FROM sales_reports sr
       JOIN locations l ON sr.location_id = l.id
       LEFT JOIN users u ON sr.submitted_by = u.id
       LEFT JOIN users r ON sr.reviewed_by = r.id
       WHERE sr.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales-reports
router.post('/', auth, async (req, res) => {
  if (!canSubmit(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  try {
    const b = req.body;
    const locationId = b.location_id || req.user.location_id;
    const result = await pool.query(
      `INSERT INTO sales_reports (
        report_date, report_type, location_id, submitted_by, submitted_by_name,
        cash_beginning, cash_sales_external, consignment, gross_sales,
        sales_discount, sales_return, total_net_cash_sales,
        delivery_fee, other_income, total_cash_receipts,
        maya_pos_qr, gcash_qr, gross_credit_sales,
        credit_sales_discount, credit_sales_return, total_net_credit_receipts,
        meals, fare, other_disbursements, total_disbursements,
        net_cash_receipts, actual_cash_deposited, cash_on_hand_available,
        cash_overage_shortage, cash_beginning_next_day,
        net_sales, notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
        $29,$30,$31,$32
      )
      ON CONFLICT (location_id, report_date, report_type) DO UPDATE SET
        cash_beginning=$6, cash_sales_external=$7, consignment=$8, gross_sales=$9,
        sales_discount=$10, sales_return=$11, total_net_cash_sales=$12,
        delivery_fee=$13, other_income=$14, total_cash_receipts=$15,
        maya_pos_qr=$16, gcash_qr=$17, gross_credit_sales=$18,
        credit_sales_discount=$19, credit_sales_return=$20, total_net_credit_receipts=$21,
        meals=$22, fare=$23, other_disbursements=$24, total_disbursements=$25,
        net_cash_receipts=$26, actual_cash_deposited=$27, cash_on_hand_available=$28,
        cash_overage_shortage=$29, cash_beginning_next_day=$30,
        net_sales=$31, notes=$32, updated_at=NOW()
      RETURNING *`,
      [
        b.report_date, b.report_type || 'daily', locationId,
        req.user.id, req.user.full_name || req.user.username,
        n(b.cash_beginning), n(b.cash_sales_external), n(b.consignment), n(b.gross_sales),
        n(b.sales_discount), n(b.sales_return), n(b.total_net_cash_sales),
        n(b.delivery_fee), n(b.other_income), n(b.total_cash_receipts),
        n(b.maya_pos_qr), n(b.gcash_qr), n(b.gross_credit_sales),
        n(b.credit_sales_discount), n(b.credit_sales_return), n(b.total_net_credit_receipts),
        n(b.meals), n(b.fare), n(b.other_disbursements), n(b.total_disbursements),
        n(b.net_cash_receipts), n(b.actual_cash_deposited), n(b.cash_on_hand_available),
        n(b.cash_overage_shortage), n(b.cash_beginning_next_day),
        n(b.net_sales), b.notes || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sales-reports/:id/approve
router.put('/:id/approve', auth, async (req, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  try {
    const result = await pool.query(
      `UPDATE sales_reports SET status='approved', reviewed_by=$1, reviewed_at=NOW(), updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sales-reports/:id
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    await pool.query('DELETE FROM sales_reports WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
