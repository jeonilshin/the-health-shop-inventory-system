const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    await pool.query(`
      UPDATE deliveries d SET status = 'delivered',
        delivered_date = COALESCE(d.delivered_date, t.delivered_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      FROM transfers t WHERE d.transfer_id = t.id AND t.status = 'delivered'
        AND d.status IN ('in_transit','admin_confirmed','awaiting_admin') AND d.transfer_id IS NOT NULL
    `).catch(() => {});

    let query = `
      SELECT d.*, fl.name as from_location_name, tl.name as to_location_name,
        u.full_name as created_by_name, au.full_name as admin_confirmed_by_name,
        t.id as transfer_id, t.status as transfer_status,
        COALESCE(json_agg(json_build_object(
          'id',di.id,'description',di.description,'unit',di.unit,
          'quantity',di.quantity,'unit_cost',di.unit_cost,'notes',di.notes
        )) FILTER (WHERE di.id IS NOT NULL),'[]') as items,
        COALESCE(SUM(di.quantity * COALESCE(di.unit_cost,0)),0) as total_value
      FROM deliveries d
      LEFT JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN users au ON d.admin_confirmed_by = au.id
      LEFT JOIN transfers t ON d.transfer_id = t.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE 1=1
    `;
    const params = [];
    let p = 1;
    if (['branch_manager','branch_staff','staff','manager'].includes(req.user.role)) {
      query += ` AND d.to_location_id = $${p++}`; params.push(req.user.location_id);
    } else if (req.user.role === 'warehouse') {
      query += ` AND d.from_location_id = $${p++}`; params.push(req.user.location_id);
    }
    if (status) { query += ` AND d.status = $${p++}`; params.push(status); }
    query += ' GROUP BY d.id, fl.name, tl.name, u.full_name, au.full_name, t.id, t.status ORDER BY d.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, fl.name as from_location_name, tl.name as to_location_name,
        u.full_name as created_by_name,
        json_agg(json_build_object('id',di.id,'description',di.description,'unit',di.unit,'quantity',di.quantity,'unit_cost',di.unit_cost,'notes',di.notes)) as items
      FROM deliveries d
      LEFT JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE d.id = $1 GROUP BY d.id, fl.name, tl.name, u.full_name
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Delivery not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', auth, authorize('admin', 'warehouse', 'manager', 'staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { from_location_id, to_location_id, delivery_date, status, notes, items } = req.body;
    if (!items || !items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'At least one item is required' }); }
    // Branch users always create requests (pending status, cannot set status themselves)
    const isBranch = ['manager', 'staff'].includes(req.user.role);
    const finalStatus = isBranch ? 'pending' : (status || 'pending');
    const deliveryResult = await client.query(
      `INSERT INTO deliveries (from_location_id,to_location_id,delivery_date,status,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [from_location_id, to_location_id, delivery_date, finalStatus, notes, req.user.id]
    );
    const delivery = deliveryResult.rows[0];
    for (const item of items) {
      await client.query(
        'INSERT INTO delivery_items (delivery_id,description,unit,quantity,unit_cost,notes,product_id,inventory_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [delivery.id, item.description, item.unit, item.quantity, item.unit_cost || 0, item.notes || null, item.product_id || null, item.inventory_id || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(delivery);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally { client.release(); }
});

router.put('/:id', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE deliveries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Delivery not found' }); }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally { client.release(); }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const delivery = await pool.query('SELECT status FROM deliveries WHERE id = $1', [req.params.id]);
    if (!delivery.rows.length) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.rows[0].status === 'delivered') return res.status(400).json({ error: 'Cannot delete a delivered delivery' });
    await pool.query('DELETE FROM deliveries WHERE id = $1', [req.params.id]);
    res.json({ message: 'Delivery deleted successfully' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:id/admin-confirm', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const delivery = await client.query('SELECT * FROM deliveries WHERE id = $1', [req.params.id]);
    if (!delivery.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Delivery not found' }); }
    if (!['awaiting_admin','pending'].includes(delivery.rows[0].status)) {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'Delivery is not awaiting admin confirmation' });
    }
    await client.query(
      `UPDATE deliveries SET status='admin_confirmed', admin_confirmed=true,
       admin_confirmed_by=$1, admin_confirmed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [req.user.id, req.params.id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Delivery confirmed by admin. Branch can now accept it.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally { client.release(); }
});

router.get('/:id/available-batches', auth, async (req, res) => {
  try {
    const delivery = await pool.query(
      `SELECT d.*, di.id as item_id, di.description, di.unit, di.quantity as requested_quantity
       FROM deliveries d LEFT JOIN delivery_items di ON d.id = di.delivery_id WHERE d.id = $1`,
      [req.params.id]
    );
    if (!delivery.rows.length) return res.status(404).json({ error: 'Delivery not found' });
    const dData = delivery.rows[0];
    const itemsWithBatches = [];
    for (const item of delivery.rows) {
      if (!item.description) continue;
      const batches = await pool.query(
        `SELECT i.id, i.batch_number, i.quantity, i.unit_cost, i.suggested_selling_price, i.expiry_date, i.created_at,
           CASE WHEN i.expiry_date IS NULL THEN 'NO_EXPIRY'
                WHEN i.expiry_date < CURRENT_DATE THEN 'EXPIRED'
                WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
                ELSE 'GOOD' END as expiry_status
         FROM inventory i JOIN products p ON i.product_id = p.id
         WHERE i.location_id = $1 AND p.name = $2 AND i.quantity > 0
         ORDER BY CASE WHEN i.expiry_date IS NULL THEN 1 ELSE 0 END, i.expiry_date ASC NULLS LAST, i.created_at ASC`,
        [dData.from_location_id, item.description]
      );
      itemsWithBatches.push({
        item_id: item.item_id, description: item.description, unit: item.unit,
        requested_quantity: item.requested_quantity, available_batches: batches.rows
      });
    }
    res.json({ delivery_id: dData.id, from_location_id: dData.from_location_id, to_location_id: dData.to_location_id, items: itemsWithBatches });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:id/accept', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { batch_selections, accepted_item_ids } = req.body;
    await client.query('BEGIN');
    const delivery = await client.query(
      `SELECT d.*, di.id as item_id, di.description, di.unit, di.quantity, di.unit_cost, di.product_id as item_product_id, di.inventory_id as item_inventory_id
       FROM deliveries d LEFT JOIN delivery_items di ON d.id = di.delivery_id WHERE d.id = $1`,
      [id]
    );
    if (!delivery.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Delivery not found' }); }
    const dData = delivery.rows[0];
    if (!['admin_confirmed','in_transit'].includes(dData.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot accept delivery with status "${dData.status}". Must be confirmed by admin first.` });
    }
    const acceptedSet = accepted_item_ids && accepted_item_ids.length > 0
      ? new Set(accepted_item_ids.map(String))
      : null;
    for (const item of delivery.rows) {
      if (!item.description) continue;
      if (acceptedSet && !acceptedSet.has(String(item.item_id))) continue;

      // If explicit inventory_id is set, use that specific batch directly
      if (item.item_inventory_id) {
        const invRow = await client.query(
          `SELECT i.*, p.name as product_name FROM inventory i JOIN products p ON i.product_id = p.id
           WHERE i.id = $1 AND i.location_id = $2 AND i.quantity > 0`,
          [item.item_inventory_id, dData.from_location_id]
        );
        if (!invRow.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Selected batch not found or depleted for ${item.description}` });
        }
        const b = invRow.rows[0];
        const transferQty = parseFloat(item.quantity);
        if (parseFloat(b.quantity) < transferQty) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Insufficient qty in selected batch for ${item.description}` });
        }
        await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [transferQty, b.id]);
        await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [b.id]);
        await client.query(
          `INSERT INTO inventory (location_id, product_id, quantity, unit_cost, suggested_selling_price, batch_number, expiry_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (location_id, product_id, batch_number) DO UPDATE SET quantity = inventory.quantity + $3, updated_at = CURRENT_TIMESTAMP`,
          [dData.to_location_id, b.product_id, transferQty, b.unit_cost, b.suggested_selling_price, b.batch_number, b.expiry_date]
        );
        continue;
      }

      // Fallback: FIFO by product name
      const sourceBatches = await client.query(
        `SELECT i.id, i.product_id, i.quantity, i.unit_cost, i.suggested_selling_price, i.batch_number, i.expiry_date
         FROM inventory i JOIN products p ON i.product_id = p.id
         WHERE i.location_id = $1 AND p.name = $2 AND i.quantity > 0
         ORDER BY CASE WHEN i.expiry_date IS NULL THEN 1 ELSE 0 END, i.expiry_date ASC NULLS LAST, i.created_at ASC`,
        [dData.from_location_id, item.description]
      );
      let remaining = parseFloat(item.quantity);
      for (const b of sourceBatches.rows) {
        if (remaining <= 0) break;
        const bQty = parseFloat(b.quantity);
        const transferQty = Math.min(bQty, remaining);
        await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [transferQty, b.id]);
        await client.query(
          `INSERT INTO inventory (location_id, product_id, quantity, unit_cost, suggested_selling_price, batch_number, expiry_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (location_id, product_id, batch_number) DO UPDATE SET quantity = inventory.quantity + $3, updated_at = CURRENT_TIMESTAMP`,
          [dData.to_location_id, b.product_id, transferQty, b.unit_cost, b.suggested_selling_price, b.batch_number, b.expiry_date]
        );
        remaining -= transferQty;
      }
      if (remaining > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Insufficient inventory for ${item.description}` }); }
    }
    await client.query(
      `UPDATE deliveries SET status='delivered', delivered_date=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id]
    );
    if (dData.transfer_id) {
      await client.query(
        `UPDATE transfers SET status='delivered', delivered_by=$1, delivered_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [req.user.id, dData.transfer_id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Delivery accepted! Items added to your inventory.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally { client.release(); }
});

router.post('/:id/reject', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rejection_reason } = req.body;
    await client.query('BEGIN');
    const d = await client.query('SELECT * FROM deliveries WHERE id = $1', [req.params.id]);
    if (!d.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Delivery not found' }); }
    await client.query(
      `UPDATE deliveries SET status='rejected', rejection_reason=$1, rejected_by=$2, rejected_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
      [rejection_reason || null, req.user.id, req.params.id]
    );
    if (d.rows[0].transfer_id) {
      await client.query(
        `UPDATE transfers SET status='rejected', rejection_reason=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [rejection_reason || 'Delivery rejected', d.rows[0].transfer_id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Delivery rejected successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally { client.release(); }
});

module.exports = router;
