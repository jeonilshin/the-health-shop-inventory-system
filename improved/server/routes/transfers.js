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
       data.reference_type||'transfer', data.reference_id||null,
       data.quantity_before||null, data.quantity_after||null, data.quantity_change||null,
       data.unit_cost||null, JSON.stringify(data.details||{})]
    );
  } catch(e){ console.error('Activity log error:', e.message); }
};

const notifyUsers = async (client, locationId, title, message, type = 'info', refType = null, refId = null) => {
  try {
    const users = await client.query(
      `SELECT id FROM users WHERE location_id = $1 AND is_active = true
       UNION
       SELECT mb.manager_id FROM manager_branches mb WHERE mb.location_id = $1`,
      [locationId]
    );
    for (const user of users.rows) {
      await client.query(
        'INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [user.id, title, message, type, refType, refId]
      );
    }
  } catch(e){ console.error('Notify error:', e.message); }
};

router.get('/', auth, async (req, res) => {
  try {
    let locationIds = null;
    if (req.user.role === 'staff') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'warehouse') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'manager') {
      locationIds = await getManagerLocationIds(req.user.id);
      if (req.user.location_id) locationIds.push(req.user.location_id);
    }

    let where = '';
    let params = [];
    if (locationIds) {
      where = 'WHERE (t.from_location_id = ANY($1) OR t.to_location_id = ANY($1))';
      params = [locationIds];
    }

    if (req.query.status && req.query.status !== 'all') {
      const statusParam = params.length + 1;
      where = where ? where + ` AND t.status = $${statusParam}` : `WHERE t.status = $${statusParam}`;
      params.push(req.query.status);
    }

    const result = await pool.query(
      `SELECT t.id, t.status, t.notes, t.rejection_reason,
              t.created_at, t.approved_at, t.shipped_at, t.received_at,
              fl.name as from_location_name, fl.type as from_location_type,
              tl.name as to_location_name, tl.type as to_location_type,
              u.full_name as requested_by_name,
              au.full_name as approved_by_name,
              ru.full_name as received_by_name,
              (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id) as item_count
       FROM transfers t
       JOIN locations fl ON t.from_location_id = fl.id
       JOIN locations tl ON t.to_location_id = tl.id
       JOIN users u ON t.requested_by = u.id
       LEFT JOIN users au ON t.approved_by = au.id
       LEFT JOIN users ru ON t.received_by = ru.id
       ${where}
       ORDER BY t.created_at DESC
       ${req.query.limit ? `LIMIT ${parseInt(req.query.limit)}` : ''}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /items — flat per-item rows for the transfers page
router.get('/items', auth, async (req, res) => {
  try {
    let locationIds = null;
    if (req.user.role === 'staff') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'warehouse') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'manager') {
      locationIds = await getManagerLocationIds(req.user.id);
      if (req.user.location_id) locationIds.push(req.user.location_id);
    }

    let where = '';
    let params = [];
    if (locationIds) {
      where = 'WHERE (t.from_location_id = ANY($1) OR t.to_location_id = ANY($1))';
      params = [locationIds];
    }

    const result = await pool.query(
      `SELECT t.id as transfer_id, t.status, t.created_at, t.notes, t.rejection_reason,
              t.from_location_id, t.to_location_id,
              fl.name as from_location_name, tl.name as to_location_name,
              u.full_name as requested_by_name,
              ti.id as item_id, p.name as product_name, p.unit,
              ti.quantity_sent, ti.quantity_received, ti.unit_cost,
              (ti.quantity_sent * COALESCE(ti.unit_cost, 0)) as value
       FROM transfers t
       JOIN locations fl ON t.from_location_id = fl.id
       JOIN locations tl ON t.to_location_id = tl.id
       JOIN users u ON t.requested_by = u.id
       LEFT JOIN transfer_items ti ON ti.transfer_id = t.id
       LEFT JOIN products p ON ti.product_id = p.id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC, p.name ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const transfer = await pool.query(
      `SELECT t.*, fl.name as from_location_name, tl.name as to_location_name,
              u.full_name as requested_by_name, au.full_name as approved_by_name,
              ru.full_name as received_by_name
       FROM transfers t
       JOIN locations fl ON t.from_location_id = fl.id
       JOIN locations tl ON t.to_location_id = tl.id
       JOIN users u ON t.requested_by = u.id
       LEFT JOIN users au ON t.approved_by = au.id
       LEFT JOIN users ru ON t.received_by = ru.id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (transfer.rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });

    const items = await pool.query(
      `SELECT ti.*, p.name as product_name, p.unit
       FROM transfer_items ti JOIN products p ON ti.product_id = p.id
       WHERE ti.transfer_id = $1 ORDER BY p.name`,
      [req.params.id]
    );

    res.json({ ...transfer.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — Create transfer using product+quantity with auto FIFO batch selection
router.post('/', auth, authorize('admin', 'warehouse', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { to_location_id, items, notes, from_location_id: bodyFromLoc } = req.body;
    // items: [{product_id, quantity}]

    if (!to_location_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'to_location_id and items required' });
    }

    const from_location_id = req.user.role === 'admin' && bodyFromLoc ? parseInt(bodyFromLoc) : req.user.location_id;

    if (!from_location_id) return res.status(400).json({ error: 'Source location not set on your account' });
    if (parseInt(from_location_id) === parseInt(to_location_id)) {
      return res.status(400).json({ error: 'Source and destination cannot be the same' });
    }

    await client.query('BEGIN');

    const fromLoc = await client.query('SELECT name FROM locations WHERE id = $1', [from_location_id]);
    const toLoc = await client.query('SELECT name FROM locations WHERE id = $1', [to_location_id]);
    if (fromLoc.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Source location not found' }); }
    if (toLoc.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Destination location not found' }); }

    // Phase 1: validate all products have sufficient stock before touching anything
    const fifoPlans = []; // [{product_id, product_name, unit, batches: [{inv_id, qty, unit_cost, batch_number, expiry_date}]}]

    for (const item of items) {
      if (item.inventory_id) {
        // Explicit batch selected
        const qty = parseFloat(item.quantity);
        if (!(qty > 0)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Each item needs quantity > 0' });
        }
        const invRow = await client.query(
          `SELECT i.*, p.name as product_name, p.unit FROM inventory i
           JOIN products p ON i.product_id = p.id
           WHERE i.id = $1 AND i.location_id = $2 AND i.quantity > 0`,
          [item.inventory_id, from_location_id]
        );
        if (!invRow.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Batch ID ${item.inventory_id} not found or depleted at source location` });
        }
        const batchRow = invRow.rows[0];
        if (parseFloat(batchRow.quantity) < qty) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Insufficient qty in batch for "${batchRow.product_name}". Batch has ${batchRow.quantity}, requested ${qty}` });
        }
        fifoPlans.push({
          product_id: batchRow.product_id,
          product_name: batchRow.product_name,
          unit: batchRow.unit,
          batches: [{ inv_id: item.inventory_id, qty, unit_cost: batchRow.unit_cost, batch_number: batchRow.batch_number, expiry_date: batchRow.expiry_date }]
        });
        continue; // skip FIFO logic for this item
      }

      const qty = parseFloat(item.quantity);
      if (!item.product_id || !(qty > 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Each item needs product_id and quantity > 0' });
      }

      const prod = await client.query('SELECT id, name, unit FROM products WHERE id = $1 AND is_active = true', [item.product_id]);
      if (prod.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product ID ${item.product_id} not found` });
      }

      // FIFO: order by expiry_date ASC NULLS LAST, then created_at ASC
      const batches = await client.query(
        `SELECT id, quantity, unit_cost, batch_number, expiry_date
         FROM inventory
         WHERE product_id = $1 AND location_id = $2 AND quantity > 0
         ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
        [item.product_id, from_location_id]
      );

      const totalAvail = batches.rows.reduce((s, r) => s + parseFloat(r.quantity), 0);
      if (totalAvail < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock for "${prod.rows[0].name}". Available: ${totalAvail}, Requested: ${qty}`
        });
      }

      // Allocate FIFO
      let remaining = qty;
      const allocated = [];
      for (const batch of batches.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, parseFloat(batch.quantity));
        allocated.push({ inv_id: batch.id, qty: take, unit_cost: batch.unit_cost, batch_number: batch.batch_number, expiry_date: batch.expiry_date });
        remaining -= take;
      }

      fifoPlans.push({ product_id: item.product_id, product_name: prod.rows[0].name, unit: prod.rows[0].unit, batches: allocated });
    }

    // Phase 2: create the transfer record
    const transfer = await client.query(
      `INSERT INTO transfers (from_location_id, to_location_id, requested_by, status, notes)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
      [from_location_id, to_location_id, req.user.id, notes || null]
    );
    const transferId = transfer.rows[0].id;

    // Phase 3: deduct inventory and create transfer_items
    for (const plan of fifoPlans) {
      // Group batches by (batch_number, expiry_date) so we create one transfer_item per distinct batch
      const batchMap = new Map();
      for (const b of plan.batches) {
        const key = `${b.batch_number}||${b.expiry_date}`;
        if (!batchMap.has(key)) batchMap.set(key, { qty: 0, unit_cost: b.unit_cost, batch_number: b.batch_number, expiry_date: b.expiry_date });
        batchMap.get(key).qty += b.qty;

        // Deduct from this inventory row
        await client.query(
          'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
          [b.qty, b.inv_id]
        );
        await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [b.inv_id]);
      }

      // Create one transfer_item per distinct batch
      for (const [, bData] of batchMap) {
        await client.query(
          `INSERT INTO transfer_items (transfer_id, product_id, quantity_sent, unit_cost, batch_number, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [transferId, plan.product_id, bData.qty, bData.unit_cost, bData.batch_number, bData.expiry_date]
        );
      }

      // Log outgoing movement
      const totalQty = plan.batches.reduce((s, b) => s + b.qty, 0);
      await logActivity(client, {
        action_type: 'transfer_sent',
        performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
        location_id: from_location_id, location_name: fromLoc.rows[0].name,
        product_id: plan.product_id, product_name: plan.product_name,
        reference_type: 'transfer', reference_id: transferId,
        quantity_change: -totalQty,
        details: { to_location: toLoc.rows[0].name, batches_used: plan.batches.length }
      });
    }

    await notifyUsers(client, to_location_id,
      'New Transfer Incoming',
      `A transfer of ${fifoPlans.length} product(s) from ${fromLoc.rows[0].name} is pending.`,
      'info', 'transfer', transferId
    );

    await client.query('COMMIT');
    const created = await pool.query(`SELECT t.*, fl.name as from_location_name, tl.name as to_location_name FROM transfers t JOIN locations fl ON t.from_location_id=fl.id JOIN locations tl ON t.to_location_id=tl.id WHERE t.id=$1`, [transferId]);
    res.status(201).json({ success: true, transfer: created.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Approve transfer
router.put('/:id/approve', auth, authorize('admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query('SELECT * FROM transfers WHERE id = $1', [req.params.id]);
    if (t.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found' }); }
    if (t.rows[0].status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: `Cannot approve transfer with status: ${t.rows[0].status}` }); }

    if (req.user.role === 'manager') {
      const managerLocs = await getManagerLocationIds(req.user.id);
      if (!managerLocs.includes(t.rows[0].to_location_id) && !managerLocs.includes(t.rows[0].from_location_id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You do not manage this transfer\'s locations' });
      }
    }

    // Approve and immediately mark as shipped (branch-to-branch transfers skip manual ship step)
    await client.query(
      'UPDATE transfers SET status=$1, approved_by=$2, approved_at=NOW(), shipped_at=NOW(), updated_at=NOW() WHERE id=$3',
      ['shipped', req.user.id, req.params.id]
    );

    await logActivity(client, {
      action_type: 'transfer_approved',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      reference_type: 'transfer', reference_id: parseInt(req.params.id),
      details: { transfer_id: req.params.id, auto_shipped: true }
    });

    await notifyUsers(client, t.rows[0].to_location_id,
      'Transfer En Route',
      `Transfer #${req.params.id} has been approved and is now in transit to you.`,
      'success', 'transfer', parseInt(req.params.id)
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transfer approved and marked as in transit' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Reject transfer — restore source inventory
router.put('/:id/reject', auth, authorize('admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { reason } = req.body;
    await client.query('BEGIN');

    const t = await client.query(
      `SELECT t.*, fl.name as from_location_name FROM transfers t
       JOIN locations fl ON t.from_location_id = fl.id WHERE t.id = $1`,
      [req.params.id]
    );
    if (t.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found' }); }
    if (!['pending','approved'].includes(t.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot reject transfer with status: ${t.rows[0].status}` });
    }

    // Restore source inventory from transfer items
    const items = await client.query('SELECT * FROM transfer_items WHERE transfer_id = $1', [req.params.id]);
    for (const item of items.rows) {
      const existing = await client.query(
        `SELECT id FROM inventory WHERE product_id = $1 AND location_id = $2
         AND batch_number IS NOT DISTINCT FROM $3 AND expiry_date IS NOT DISTINCT FROM $4`,
        [item.product_id, t.rows[0].from_location_id, item.batch_number, item.expiry_date]
      );
      if (existing.rows.length > 0) {
        await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [item.quantity_sent, existing.rows[0].id]);
      } else {
        await client.query(
          'INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date) VALUES ($1,$2,$3,$4,$5,$6)',
          [item.product_id, t.rows[0].from_location_id, item.quantity_sent, item.unit_cost, item.batch_number, item.expiry_date]
        );
      }
    }

    await client.query(
      'UPDATE transfers SET status=$1, rejection_reason=$2, updated_at=NOW() WHERE id=$3',
      ['rejected', reason || null, req.params.id]
    );

    await logActivity(client, {
      action_type: 'transfer_rejected',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      reference_type: 'transfer', reference_id: parseInt(req.params.id),
      details: { reason, inventory_restored: true }
    });

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transfer rejected and inventory restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Ship transfer
router.put('/:id/ship', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query('SELECT * FROM transfers WHERE id = $1', [req.params.id]);
    if (t.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found' }); }
    if (!['approved','pending'].includes(t.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot ship transfer with status: ${t.rows[0].status}` });
    }

    await client.query(
      'UPDATE transfers SET status=$1, shipped_at=NOW(), updated_at=NOW() WHERE id=$2',
      ['shipped', req.params.id]
    );

    await logActivity(client, {
      action_type: 'transfer_shipped',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      reference_type: 'transfer', reference_id: parseInt(req.params.id),
      details: { transfer_id: req.params.id }
    });

    await notifyUsers(client, t.rows[0].to_location_id,
      'Transfer Shipped',
      `Transfer #${req.params.id} has been shipped to you. Please receive when arrived.`,
      'info', 'transfer', parseInt(req.params.id)
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transfer marked as shipped' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// *** RECEIVE TRANSFER — THE KEY FIX ***
// Creates inventory at destination from transfer_items data — never looks at source
router.put('/:id/receive', auth, authorize('admin', 'manager', 'staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { items } = req.body; // [{transfer_item_id, quantity_received}]
    if (!items || items.length === 0) return res.status(400).json({ error: 'items required' });

    await client.query('BEGIN');

    const t = await client.query(
      `SELECT t.*, tl.name as to_location_name FROM transfers t
       JOIN locations tl ON t.to_location_id = tl.id WHERE t.id = $1`,
      [req.params.id]
    );
    if (t.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found' }); }

    // Access check: staff/manager must be at destination
    if (req.user.role === 'staff') {
      if (req.user.location_id !== t.rows[0].to_location_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only receive transfers at your location' });
      }
    } else if (req.user.role === 'manager') {
      const managerLocs = await getManagerLocationIds(req.user.id);
      if (!managerLocs.includes(t.rows[0].to_location_id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You do not manage the destination location' });
      }
    }

    if (!['shipped', 'approved', 'pending'].includes(t.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot receive transfer with status: ${t.rows[0].status}` });
    }

    const destLocationId = t.rows[0].to_location_id;
    const destLocationName = t.rows[0].to_location_name;

    for (const item of items) {
      // Get transfer item (has all the batch info we need)
      const ti = await client.query(
        `SELECT ti.*, p.name as product_name, p.unit FROM transfer_items ti
         JOIN products p ON ti.product_id = p.id
         WHERE ti.id = $1 AND ti.transfer_id = $2`,
        [item.transfer_item_id, req.params.id]
      );
      if (ti.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Transfer item ${item.transfer_item_id} not found` });
      }
      const tiRow = ti.rows[0];
      const qtyReceived = parseFloat(item.quantity_received);
      if (qtyReceived <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'quantity_received must be > 0' });
      }
      if (qtyReceived > parseFloat(tiRow.quantity_sent)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot receive more than sent. Sent: ${tiRow.quantity_sent}` });
      }

      // Match by product + batch_number + expiry_date + unit_cost at destination
      // unit_cost must match too — different cost = different batch for COGS accuracy
      const existing = await client.query(
        `SELECT id, quantity FROM inventory
         WHERE product_id = $1 AND location_id = $2
         AND batch_number IS NOT DISTINCT FROM $3
         AND expiry_date IS NOT DISTINCT FROM $4
         AND unit_cost IS NOT DISTINCT FROM $5`,
        [tiRow.product_id, destLocationId, tiRow.batch_number, tiRow.expiry_date, tiRow.unit_cost]
      );

      let newQty;
      if (existing.rows.length > 0) {
        // Add to existing inventory row at destination
        const updated = await client.query(
          'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING quantity',
          [qtyReceived, existing.rows[0].id]
        );
        newQty = parseFloat(updated.rows[0].quantity);
      } else {
        // *** CREATE NEW inventory at destination — this always works! ***
        // Uses data from transfer_items, never from source inventory
        const inserted = await client.query(
          `INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING quantity`,
          [tiRow.product_id, destLocationId, qtyReceived, tiRow.unit_cost, tiRow.batch_number, tiRow.expiry_date]
        );
        newQty = parseFloat(inserted.rows[0].quantity);
      }

      // Update transfer item with received quantity
      await client.query(
        'UPDATE transfer_items SET quantity_received = $1 WHERE id = $2',
        [qtyReceived, item.transfer_item_id]
      );

      // Log the incoming inventory movement
      await logActivity(client, {
        action_type: 'transfer_received',
        performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
        location_id: destLocationId, location_name: destLocationName,
        product_id: tiRow.product_id, product_name: tiRow.product_name,
        reference_type: 'transfer', reference_id: parseInt(req.params.id),
        quantity_change: qtyReceived,
        unit_cost: tiRow.unit_cost,
        details: { from_location_id: t.rows[0].from_location_id, batch_number: tiRow.batch_number, expiry_date: tiRow.expiry_date }
      });
    }

    // Mark transfer as received
    await client.query(
      'UPDATE transfers SET status=$1, received_by=$2, received_at=NOW(), updated_at=NOW() WHERE id=$3',
      ['received', req.user.id, req.params.id]
    );

    // Notify source
    await notifyUsers(client, t.rows[0].from_location_id,
      'Transfer Received',
      `Transfer #${req.params.id} has been received at ${destLocationName}.`,
      'success', 'transfer', parseInt(req.params.id)
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transfer received and inventory updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Unreceive transfer — admin only, removes inventory from destination and reverts to shipped
router.put('/:id/unreceive', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const t = await client.query(
      `SELECT t.*, tl.name as to_location_name FROM transfers t
       JOIN locations tl ON t.to_location_id = tl.id WHERE t.id = $1`,
      [req.params.id]
    );
    if (t.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found' }); }
    if (t.rows[0].status !== 'received') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only unreceive transfers with status: received' });
    }

    const items = await client.query('SELECT * FROM transfer_items WHERE transfer_id = $1', [req.params.id]);
    for (const item of items.rows) {
      const qty = parseFloat(item.quantity_received || item.quantity_sent);
      await client.query(
        `UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at = NOW()
         WHERE product_id = $2 AND location_id = $3
         AND batch_number IS NOT DISTINCT FROM $4 AND expiry_date IS NOT DISTINCT FROM $5`,
        [qty, item.product_id, t.rows[0].to_location_id, item.batch_number, item.expiry_date]
      );
      await client.query('UPDATE transfer_items SET quantity_received = NULL WHERE id = $1', [item.id]);
    }

    await client.query(
      'UPDATE transfers SET status=$1, received_by=NULL, received_at=NULL, updated_at=NOW() WHERE id=$2',
      ['shipped', req.params.id]
    );

    await logActivity(client, {
      action_type: 'transfer_unreceived',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      reference_type: 'transfer', reference_id: parseInt(req.params.id),
      details: { transfer_id: req.params.id, inventory_removed_from: t.rows[0].to_location_name }
    });

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transfer unreceived and inventory reversed' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Cancel transfer — restore source inventory
router.put('/:id/cancel', auth, authorize('admin', 'warehouse', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { reason } = req.body;
    await client.query('BEGIN');

    const t = await client.query('SELECT * FROM transfers WHERE id = $1', [req.params.id]);
    if (t.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found' }); }
    if (!['pending','approved'].includes(t.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only cancel pending or approved transfers' });
    }

    const items = await client.query('SELECT * FROM transfer_items WHERE transfer_id = $1', [req.params.id]);
    for (const item of items.rows) {
      const existing = await client.query(
        `SELECT id FROM inventory WHERE product_id = $1 AND location_id = $2
         AND batch_number IS NOT DISTINCT FROM $3 AND expiry_date IS NOT DISTINCT FROM $4`,
        [item.product_id, t.rows[0].from_location_id, item.batch_number, item.expiry_date]
      );
      if (existing.rows.length > 0) {
        await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [item.quantity_sent, existing.rows[0].id]);
      } else {
        await client.query(
          'INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date) VALUES ($1,$2,$3,$4,$5,$6)',
          [item.product_id, t.rows[0].from_location_id, item.quantity_sent, item.unit_cost, item.batch_number, item.expiry_date]
        );
      }
    }

    await client.query(
      'UPDATE transfers SET status=$1, rejection_reason=$2, updated_at=NOW() WHERE id=$3',
      ['cancelled', reason || null, req.params.id]
    );

    await logActivity(client, {
      action_type: 'transfer_cancelled',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      reference_type: 'transfer', reference_id: parseInt(req.params.id),
      details: { reason, inventory_restored: true }
    });

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transfer cancelled and inventory restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Batch transfer — creates multiple transfers at once, auto-received immediately
router.post('/batch', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const { transfers } = req.body;
  if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
    return res.status(400).json({ error: 'transfers array required' });
  }

  const results = [];
  const errors = [];

  for (const td of transfers) {
    const client = await pool.connect();
    try {
      const { from_location_id, to_location_id, notes, items } = td;
      if (!from_location_id || !to_location_id || !Array.isArray(items) || items.length === 0) {
        throw new Error('Transfer missing required fields (from_location_id, to_location_id, items)');
      }

      await client.query('BEGIN');

      const fromLoc = await client.query('SELECT name FROM locations WHERE id = $1', [from_location_id]);
      const toLoc   = await client.query('SELECT name FROM locations WHERE id = $1', [to_location_id]);
      if (!fromLoc.rows.length || !toLoc.rows.length) {
        throw new Error(`Invalid locations: from=${from_location_id}, to=${to_location_id}`);
      }

      // FIFO plan across all items — validate stock availability first
      const fifoPlans = [];
      for (const item of items) {
        const qty = parseFloat(item.quantity);
        if (!item.product_id || !(qty > 0)) {
          throw new Error(`Item missing product_id or valid quantity`);
        }

        const batches = await client.query(
          `SELECT id, quantity, unit_cost, batch_number, expiry_date
           FROM inventory
           WHERE product_id = $1 AND location_id = $2 AND quantity > 0
           ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
          [item.product_id, from_location_id]
        );

        const totalAvail = batches.rows.reduce((s, r) => s + parseFloat(r.quantity), 0);
        if (totalAvail < qty) {
          throw new Error(`Insufficient stock for product ${item.product_id}. Available: ${totalAvail}, Requested: ${qty}`);
        }

        let remaining = qty;
        const allocated = [];
        for (const batch of batches.rows) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, parseFloat(batch.quantity));
          allocated.push({ inv_id: batch.id, qty: take, unit_cost: batch.unit_cost, batch_number: batch.batch_number, expiry_date: batch.expiry_date });
          remaining -= take;
        }
        fifoPlans.push({ product_id: item.product_id, batches: allocated });
      }

      // Create transfer record — status 'received' (auto-completed)
      const transfer = await client.query(
        `INSERT INTO transfers (from_location_id, to_location_id, requested_by, status, notes,
          approved_by, approved_at, shipped_at, received_by, received_at)
         VALUES ($1, $2, $3, 'received', $4, $3, NOW(), NOW(), $3, NOW()) RETURNING id`,
        [from_location_id, to_location_id, req.user.id, notes || null]
      );
      const transferId = transfer.rows[0].id;

      // Deduct source, add dest, create transfer_items
      for (const plan of fifoPlans) {
        const batchMap = new Map();
        for (const b of plan.batches) {
          const key = `${b.batch_number}||${b.expiry_date}`;
          if (!batchMap.has(key)) batchMap.set(key, { qty: 0, unit_cost: b.unit_cost, batch_number: b.batch_number, expiry_date: b.expiry_date });
          batchMap.get(key).qty += b.qty;

          await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [b.qty, b.inv_id]);
          await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [b.inv_id]);
        }

        for (const [, bData] of batchMap) {
          const destExisting = await client.query(
            `SELECT id FROM inventory WHERE product_id = $1 AND location_id = $2
             AND unit_cost IS NOT DISTINCT FROM $3
             AND batch_number IS NOT DISTINCT FROM $4
             AND expiry_date IS NOT DISTINCT FROM $5 LIMIT 1`,
            [plan.product_id, to_location_id, bData.unit_cost, bData.batch_number, bData.expiry_date]
          );
          if (destExisting.rows.length > 0) {
            await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [bData.qty, destExisting.rows[0].id]);
          } else {
            await client.query(
              'INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date) VALUES ($1,$2,$3,$4,$5,$6)',
              [plan.product_id, to_location_id, bData.qty, bData.unit_cost, bData.batch_number, bData.expiry_date]
            );
          }

          await client.query(
            'INSERT INTO transfer_items (transfer_id, product_id, quantity_sent, quantity_received, unit_cost, batch_number, expiry_date) VALUES ($1,$2,$3,$3,$4,$5,$6)',
            [transferId, plan.product_id, bData.qty, bData.unit_cost, bData.batch_number, bData.expiry_date]
          );
        }
      }

      await client.query('COMMIT');
      results.push({ transfer_id: transferId, from_location: fromLoc.rows[0].name, to_location: toLoc.rows[0].name, items_count: items.length });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      errors.push(err.message);
    } finally {
      client.release();
    }
  }

  res.json({ success: true, results, errors, message: `${results.length} transfers created, ${errors.length} errors.` });
});

module.exports = router;
