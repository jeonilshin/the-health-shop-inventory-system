const router = require('express').Router();
const pool = require('../config/db');
const { auth, authorize, getManagerLocationIds } = require('../middleware/auth');

const logActivity = async (client, data) => {
  try {
    await client.query(
      `INSERT INTO activity_log (action_type, performed_by, performer_name, performer_role,
        location_id, location_name, product_id, product_name, reference_type, reference_id,
        quantity_before, quantity_after, quantity_change, unit_cost, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [data.action_type, data.performed_by, data.performer_name, data.performer_role,
       data.location_id||null, data.location_name||null, data.product_id||null, data.product_name||null,
       data.reference_type||'sale', data.reference_id||null,
       data.quantity_before||null, data.quantity_after||null, data.quantity_change||null,
       data.unit_cost||null, JSON.stringify(data.details||{})]
    );
  } catch(e){ console.error('Activity log error:', e.message); }
};

router.get('/', auth, async (req, res) => {
  try {
    const { from_date, to_date, status, limit } = req.query;
    let locationIds = null;

    if (req.user.role === 'staff') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'manager') {
      locationIds = await getManagerLocationIds(req.user.id);
      if (req.user.location_id) locationIds.push(req.user.location_id);
    } else if (req.user.role === 'warehouse') {
      locationIds = [req.user.location_id];
    } else if (req.query.location_id) {
      locationIds = [parseInt(req.query.location_id)];
    }

    let conditions = [];
    let params = [];
    let idx = 1;

    if (locationIds) {
      conditions.push(`s.location_id = ANY($${idx})`);
      params.push(locationIds);
      idx++;
    }
    if (from_date) { conditions.push(`s.created_at >= $${idx}`); params.push(from_date); idx++; }
    if (to_date) { conditions.push(`s.created_at <= $${idx}::date + interval '1 day'`); params.push(to_date); idx++; }
    if (status) { conditions.push(`s.status = $${idx}`); params.push(status); idx++; }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT s.id, s.total_amount, s.discount_amount, s.customer_name, s.status, s.notes,
              s.created_at, s.cancelled_at, s.cancel_reason,
              s.cancel_requested_by, s.cancel_request_reason, s.cancel_requested_at,
              l.name as location_name,
              u.full_name as sold_by_name,
              cu.full_name as cancelled_by_name,
              rqu.full_name as cancel_requested_by_name,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count,
              (SELECT p.name FROM sale_items si2 JOIN products p ON si2.product_id = p.id WHERE si2.sale_id = s.id ORDER BY si2.id LIMIT 1) as first_product_name,
              (SELECT p.unit FROM sale_items si2 JOIN products p ON si2.product_id = p.id WHERE si2.sale_id = s.id ORDER BY si2.id LIMIT 1) as first_product_unit,
              (SELECT si2.quantity FROM sale_items si2 WHERE si2.sale_id = s.id ORDER BY si2.id LIMIT 1) as first_item_qty
       FROM sales s
       JOIN locations l ON s.location_id = l.id
       JOIN users u ON s.sold_by = u.id
       LEFT JOIN users cu ON s.cancelled_by = cu.id
       LEFT JOIN users rqu ON s.cancel_requested_by = rqu.id
       ${where}
       ORDER BY s.created_at DESC
       ${limit ? `LIMIT ${parseInt(limit)}` : ''}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const sale = await pool.query(
      `SELECT s.*, l.name as location_name, u.full_name as sold_by_name
       FROM sales s JOIN locations l ON s.location_id = l.id JOIN users u ON s.sold_by = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (sale.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

    const items = await pool.query(
      `SELECT si.*, p.name as product_name, p.unit FROM sale_items si
       JOIN products p ON si.product_id = p.id WHERE si.sale_id = $1`,
      [req.params.id]
    );

    res.json({ ...sale.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, authorize('admin', 'manager', 'staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, discount_amount, customer_name, notes, payment_method } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'items required' });

    const isPrivileged = req.user.role === 'admin' || req.user.role === 'manager';
    const location_id = isPrivileged && req.body.location_id
      ? parseInt(req.body.location_id)
      : req.user.location_id;
    if (!location_id) return res.status(400).json({ error: 'Your account has no location assigned' });

    await client.query('BEGIN');

    const loc = await client.query('SELECT name FROM locations WHERE id = $1', [location_id]);

    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0 || !item.unit_price) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Each item needs product_id, quantity > 0, and unit_price' });
      }

      // Get product info
      const prod = await client.query('SELECT name FROM products WHERE id = $1', [item.product_id]);
      if (prod.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Product ${item.product_id} not found` }); }

      let firstInvId = null;
      let firstUnitCost = null;

      if (item.inventory_id) {
        // Explicit batch selected by user
        const invRow = await client.query(
          'SELECT * FROM inventory WHERE id = $1 AND product_id = $2 AND location_id = $3 AND quantity > 0',
          [item.inventory_id, item.product_id, location_id]
        );
        if (!invRow.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Selected batch not found or depleted for "${prod.rows[0].name}"` });
        }
        if (parseFloat(invRow.rows[0].quantity) < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Insufficient qty in selected batch for "${prod.rows[0].name}". Batch has ${invRow.rows[0].quantity}, requested ${item.quantity}` });
        }
        await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [item.quantity, item.inventory_id]);
        await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [item.inventory_id]);
        firstInvId = item.inventory_id;
        firstUnitCost = invRow.rows[0].unit_cost;
      } else {
        // FIFO deduction
        const invRows = await client.query(
          `SELECT * FROM inventory WHERE product_id = $1 AND location_id = $2 AND quantity > 0
           ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
          [item.product_id, location_id]
        );

        const totalAvailable = invRows.rows.reduce((sum, r) => sum + parseFloat(r.quantity), 0);
        if (totalAvailable < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Insufficient inventory for "${prod.rows[0].name}". Available: ${totalAvailable}, Requested: ${item.quantity}`
          });
        }

        let remaining = parseFloat(item.quantity);
        for (const invRow of invRows.rows) {
          if (remaining <= 0) break;
          const deduct = Math.min(parseFloat(invRow.quantity), remaining);
          await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [deduct, invRow.id]);
          await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [invRow.id]);
          if (!firstInvId) { firstInvId = invRow.id; firstUnitCost = invRow.unit_cost; }
          remaining -= deduct;
        }
      }

      const subtotal = parseFloat(item.unit_price) * parseFloat(item.quantity);
      totalAmount += subtotal;
      processedItems.push({ ...item, inventory_id: firstInvId, unit_cost: firstUnitCost, subtotal, product_name: prod.rows[0].name });
    }

    const discount = parseFloat(discount_amount) || 0;
    const finalTotal = totalAmount - discount;

    const sale = await client.query(
      `INSERT INTO sales (location_id, sold_by, customer_name, total_amount, discount_amount, notes, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [location_id, req.user.id, customer_name || null, finalTotal, discount, notes || null, payment_method || 'cash']
    );
    const saleId = sale.rows[0].id;

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, inventory_id, quantity, unit_price, unit_cost, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [saleId, item.product_id, item.inventory_id, item.quantity, item.unit_price, item.unit_cost, item.subtotal]
      );

      await logActivity(client, {
        action_type: 'sale',
        performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
        location_id, location_name: loc.rows[0].name,
        product_id: item.product_id, product_name: item.product_name,
        reference_type: 'sale', reference_id: saleId,
        quantity_change: -parseFloat(item.quantity),
        unit_cost: item.unit_cost,
        details: { unit_price: item.unit_price, subtotal: item.subtotal, customer: customer_name }
      });
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, sale: sale.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Helper: execute the actual cancellation (used by both direct cancel and approve-cancel)
async function executeCancellation(client, saleId, cancelledBy, reason) {
  const sale = await client.query(
    `SELECT s.*, l.name as location_name FROM sales s JOIN locations l ON s.location_id = l.id WHERE s.id = $1`,
    [saleId]
  );
  if (sale.rows.length === 0) return { error: 'Sale not found', status: 404 };
  if (sale.rows[0].status === 'cancelled') return { error: 'Sale already cancelled', status: 400 };

  const saleItems = await client.query(
    'SELECT si.*, p.name as product_name FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = $1',
    [saleId]
  );

  for (const item of saleItems.rows) {
    const existing = await client.query(
      `SELECT id FROM inventory WHERE product_id = $1 AND location_id = $2 LIMIT 1`,
      [item.product_id, sale.rows[0].location_id]
    );
    if (existing.rows.length > 0) {
      await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [item.quantity, existing.rows[0].id]);
    } else {
      await client.query(
        'INSERT INTO inventory (product_id, location_id, quantity, unit_cost) VALUES ($1,$2,$3,$4)',
        [item.product_id, sale.rows[0].location_id, item.quantity, item.unit_cost]
      );
    }

    await logActivity(client, {
      action_type: 'sale_cancelled',
      performed_by: cancelledBy.id, performer_name: cancelledBy.full_name, performer_role: cancelledBy.role,
      location_id: sale.rows[0].location_id, location_name: sale.rows[0].location_name,
      product_id: item.product_id, product_name: item.product_name,
      reference_type: 'sale', reference_id: parseInt(saleId),
      quantity_change: parseFloat(item.quantity),
      unit_cost: item.unit_cost,
      details: { reason, sale_id: saleId }
    });
  }

  await client.query(
    'UPDATE sales SET status=$1, cancelled_by=$2, cancelled_at=NOW(), cancel_reason=$3 WHERE id=$4',
    ['cancelled', cancelledBy.id, reason, saleId]
  );

  return { success: true };
}

// Admin: direct cancel
router.put('/:id/cancel', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Cancellation reason required' });
    await client.query('BEGIN');
    const result = await executeCancellation(client, req.params.id, req.user, reason);
    if (result.error) { await client.query('ROLLBACK'); return res.status(result.status).json({ error: result.error }); }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Sale cancelled and inventory restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Staff/Manager/Admin: request cancellation
router.put('/:id/request-cancel', auth, authorize('admin', 'manager', 'staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Cancellation reason required' });
    await client.query('BEGIN');
    const sale = await client.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (sale.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Sale not found' }); }
    if (sale.rows[0].status !== 'completed') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Only completed sales can be requested for cancellation' }); }
    await client.query(
      `UPDATE sales SET status='cancel_requested', cancel_requested_by=$1, cancel_request_reason=$2, cancel_requested_at=NOW() WHERE id=$3`,
      [req.user.id, reason.trim(), req.params.id]
    );
    await client.query('COMMIT');
    res.json({ success: true, message: 'Cancellation request submitted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Admin: approve a cancellation request
router.put('/:id/approve-cancel', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sale = await client.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (sale.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Sale not found' }); }
    if (sale.rows[0].status !== 'cancel_requested') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No pending cancellation request for this sale' }); }
    const reason = sale.rows[0].cancel_request_reason || 'Approved cancellation request';
    const result = await executeCancellation(client, req.params.id, req.user, reason);
    if (result.error) { await client.query('ROLLBACK'); return res.status(result.status).json({ error: result.error }); }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Cancellation approved and inventory restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Admin: reject a cancellation request
router.put('/:id/reject-cancel', auth, authorize('admin'), async (req, res) => {
  try {
    const sale = await pool.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (sale.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });
    if (sale.rows[0].status !== 'cancel_requested') return res.status(400).json({ error: 'No pending cancellation request for this sale' });
    await pool.query(
      `UPDATE sales SET status='completed', cancel_requested_by=NULL, cancel_request_reason=NULL, cancel_requested_at=NULL WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Cancellation request rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
