const router = require('express').Router();
const pool = require('../config/db');
const { auth, authorize, getManagerLocationIds } = require('../middleware/auth');

const TYPES = ['employee_purchase', 'principal', 'outside_party', 'expired', 'damaged', 'other'];

const logActivity = async (client, data) => {
  try {
    await client.query(
      `INSERT INTO activity_log (action_type, performed_by, performer_name, performer_role,
        location_id, location_name, product_id, product_name, reference_type, reference_id,
        quantity_change, unit_cost, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [data.action_type, data.performed_by, data.performer_name, data.performer_role,
       data.location_id||null, data.location_name||null, data.product_id||null, data.product_name||null,
       data.reference_type||'withdrawal', data.reference_id||null,
       data.quantity_change||null, data.unit_cost||null, JSON.stringify(data.details||{})]
    );
  } catch(e){ console.error('Activity log error:', e.message); }
};

router.get('/', auth, async (req, res) => {
  try {
    const { from_date, to_date, location_id, withdrawal_type } = req.query;

    let locationIds = null;
    if (req.user.role === 'staff') locationIds = [req.user.location_id];
    else if (req.user.role === 'warehouse') locationIds = [req.user.location_id];
    else if (req.user.role === 'manager') {
      locationIds = await getManagerLocationIds(req.user.id);
      if (req.user.location_id) locationIds.push(req.user.location_id);
    }

    let conditions = [];
    let params = [];
    let idx = 1;

    if (locationIds) {
      conditions.push(`sw.location_id = ANY($${idx})`);
      params.push(locationIds); idx++;
    } else if (location_id) {
      conditions.push(`sw.location_id = $${idx}`);
      params.push(parseInt(location_id)); idx++;
    }

    if (withdrawal_type && TYPES.includes(withdrawal_type)) {
      conditions.push(`sw.withdrawal_type = $${idx}`);
      params.push(withdrawal_type); idx++;
    }
    if (from_date) { conditions.push(`sw.created_at >= $${idx}`); params.push(from_date); idx++; }
    if (to_date) { conditions.push(`sw.created_at <= $${idx}::date + interval '1 day'`); params.push(to_date); idx++; }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT sw.id, sw.withdrawal_type, sw.reason, sw.notes, sw.total_value, sw.created_at,
              l.name as location_name, u.full_name as withdrawn_by_name, u.role as withdrawn_by_role,
              (SELECT COUNT(*) FROM stock_withdrawal_items WHERE withdrawal_id = sw.id) as item_count
       FROM stock_withdrawals sw
       JOIN locations l ON sw.location_id = l.id
       JOIN users u ON sw.withdrawn_by = u.id
       ${where}
       ORDER BY sw.created_at DESC
       LIMIT 200`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const sw = await pool.query(
      `SELECT sw.*, l.name as location_name, u.full_name as withdrawn_by_name
       FROM stock_withdrawals sw
       JOIN locations l ON sw.location_id = l.id
       JOIN users u ON sw.withdrawn_by = u.id
       WHERE sw.id = $1`,
      [req.params.id]
    );
    if (sw.rows.length === 0) return res.status(404).json({ error: 'Withdrawal not found' });

    const items = await pool.query(
      `SELECT swi.*, p.name as product_name, p.unit
       FROM stock_withdrawal_items swi
       JOIN products p ON swi.product_id = p.id
       WHERE swi.withdrawal_id = $1`,
      [req.params.id]
    );

    res.json({ ...sw.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — create withdrawal with auto FIFO deduction
router.post('/', auth, authorize('admin', 'warehouse', 'manager', 'staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, withdrawal_type, reason, notes, location_id: bodyLoc } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'items required' });

    const location_id = (req.user.role === 'admin' || req.user.role === 'manager') && bodyLoc
      ? parseInt(bodyLoc)
      : req.user.location_id;
    if (!location_id) return res.status(400).json({ error: 'Location not set' });

    const type = TYPES.includes(withdrawal_type) ? withdrawal_type : 'other';

    await client.query('BEGIN');

    const loc = await client.query('SELECT name FROM locations WHERE id = $1', [location_id]);
    if (loc.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Location not found' }); }

    // Validate and FIFO plan
    const plans = [];
    for (const item of items) {
      const qty = parseFloat(item.quantity);
      if (!item.product_id || !(qty > 0)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Each item needs product_id and quantity > 0' }); }

      const prod = await client.query('SELECT id, name, unit FROM products WHERE id = $1', [item.product_id]);
      if (prod.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Product ${item.product_id} not found` }); }

      const batches = await client.query(
        `SELECT id, quantity, unit_cost, batch_number, expiry_date
         FROM inventory WHERE product_id = $1 AND location_id = $2 AND quantity > 0
         ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
        [item.product_id, location_id]
      );

      const totalAvail = batches.rows.reduce((s, r) => s + parseFloat(r.quantity), 0);
      if (totalAvail < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for "${prod.rows[0].name}". Available: ${totalAvail}, Requested: ${qty}` });
      }

      let remaining = qty;
      const allocated = [];
      for (const b of batches.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, parseFloat(b.quantity));
        allocated.push({ inv_id: b.id, qty: take, unit_cost: b.unit_cost, batch_number: b.batch_number, expiry_date: b.expiry_date });
        remaining -= take;
      }

      plans.push({ product_id: item.product_id, product_name: prod.rows[0].name, unit: prod.rows[0].unit, batches: allocated });
    }

    // Create withdrawal header
    const totalValue = plans.reduce((sum, p) => {
      return sum + p.batches.reduce((s, b) => s + (b.qty * (b.unit_cost || 0)), 0);
    }, 0);

    const sw = await client.query(
      `INSERT INTO stock_withdrawals (location_id, withdrawn_by, withdrawal_type, reason, notes, total_value)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [location_id, req.user.id, type, reason || null, notes || null, totalValue]
    );
    const swId = sw.rows[0].id;

    // Deduct inventory and create items
    for (const plan of plans) {
      const batchMap = new Map();
      for (const b of plan.batches) {
        const key = `${b.batch_number}||${b.expiry_date}`;
        if (!batchMap.has(key)) batchMap.set(key, { qty: 0, unit_cost: b.unit_cost, batch_number: b.batch_number, expiry_date: b.expiry_date });
        batchMap.get(key).qty += b.qty;

        await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [b.qty, b.inv_id]);
        await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [b.inv_id]);
      }

      for (const [, bData] of batchMap) {
        await client.query(
          `INSERT INTO stock_withdrawal_items (withdrawal_id, product_id, quantity, unit_cost, batch_number, expiry_date, subtotal)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [swId, plan.product_id, bData.qty, bData.unit_cost, bData.batch_number, bData.expiry_date, bData.qty * (bData.unit_cost || 0)]
        );
      }

      const totalQty = plan.batches.reduce((s, b) => s + b.qty, 0);
      await logActivity(client, {
        action_type: 'stock_withdrawal',
        performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
        location_id: location_id, location_name: loc.rows[0].name,
        product_id: plan.product_id, product_name: plan.product_name,
        reference_type: 'withdrawal', reference_id: swId,
        quantity_change: -totalQty,
        details: { withdrawal_type: type, reason }
      });
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, withdrawal_id: swId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
