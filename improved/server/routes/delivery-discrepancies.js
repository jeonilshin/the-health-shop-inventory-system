const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT dd.*, bl.name AS branch_name, wl.name AS warehouse_name,
        ru.full_name AS reported_by_name, rv.full_name AS resolved_by_name, d.delivery_date
      FROM delivery_discrepancies dd
      LEFT JOIN locations bl ON dd.branch_location_id = bl.id
      LEFT JOIN locations wl ON dd.warehouse_location_id = wl.id
      LEFT JOIN users ru ON dd.reported_by = ru.id
      LEFT JOIN users rv ON dd.resolved_by = rv.id
      LEFT JOIN deliveries d ON dd.delivery_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let p = 1;
    if (['branch_manager','branch_staff','staff','manager'].includes(req.user.role)) {
      query += ` AND dd.branch_location_id = $${p++}`; params.push(req.user.location_id);
    } else if (req.user.role === 'warehouse') {
      query += ` AND dd.warehouse_location_id = $${p++}`; params.push(req.user.location_id);
    }
    query += ' ORDER BY dd.reported_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/pending-count', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM delivery_discrepancies WHERE status = 'pending'");
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { type, delivery_id, item_description, unit, unit_cost, expected_quantity, received_quantity, note, branch_location_id, warehouse_location_id } = req.body;
    if (!type || !item_description?.trim() || !unit?.trim() || expected_quantity == null || received_quantity == null || !note?.trim()) {
      return res.status(400).json({ error: 'All fields are required including note' });
    }
    if (!['shortage','return','damage','overage'].includes(type)) {
      return res.status(400).json({ error: 'Type must be shortage, return, damage, or overage' });
    }
    const branchLocId = type === 'damage' ? (branch_location_id || null) : (branch_location_id || req.user.location_id);
    const result = await pool.query(`
      INSERT INTO delivery_discrepancies
        (type, delivery_id, item_description, unit, unit_cost, expected_quantity, received_quantity, note,
         branch_location_id, warehouse_location_id, reported_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [type, delivery_id || null, item_description.trim(), unit.trim(), unit_cost || 0,
        expected_quantity, received_quantity, note.trim(), branchLocId, warehouse_location_id || null, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/:id/approve', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const discResult = await client.query('SELECT * FROM delivery_discrepancies WHERE id = $1', [id]);
    if (!discResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Discrepancy not found' }); }
    const disc = discResult.rows[0];
    if (disc.status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already resolved' }); }

    const updated = await client.query(
      `UPDATE delivery_discrepancies SET status='approved', resolved_by=$1, resolved_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
      [req.user.id, id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Discrepancy approved', discrepancy: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally { client.release(); }
});

router.put('/:id/add-to-inventory', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const discResult = await client.query('SELECT * FROM delivery_discrepancies WHERE id = $1', [id]);
    if (!discResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Discrepancy not found' }); }
    const disc = discResult.rows[0];
    if (disc.status === 'completed') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already completed' }); }

    const adjustQty = disc.type === 'shortage'
      ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
      : parseFloat(disc.received_quantity);

    if (adjustQty <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Adjustment quantity must be positive' }); }

    if (disc.type === 'shortage' && disc.warehouse_location_id) {
      const batchId = `DISC-${disc.id}-${Date.now()}`;
      await client.query(
        `INSERT INTO inventory (location_id, product_id, quantity, unit_cost)
         SELECT $1, p.id, $2, $3 FROM products p WHERE p.name = $4
         ON CONFLICT DO NOTHING`,
        [disc.warehouse_location_id, adjustQty, disc.unit_cost || 0, disc.item_description]
      );
    } else if (disc.type === 'return' && disc.branch_location_id) {
      const branchInv = await client.query(
        `SELECT i.id, i.quantity FROM inventory i JOIN products p ON i.product_id = p.id
         WHERE i.location_id = $1 AND p.name = $2 ORDER BY i.created_at ASC`,
        [disc.branch_location_id, disc.item_description]
      );
      let remaining = adjustQty;
      for (const b of branchInv.rows) {
        if (remaining <= 0) break;
        const deduct = Math.min(parseFloat(b.quantity), remaining);
        await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE id = $2', [deduct, b.id]);
        remaining -= deduct;
      }
    } else if (disc.type === 'damage') {
      const locId = disc.branch_location_id || disc.warehouse_location_id;
      const invRows = await client.query(
        `SELECT i.id, i.quantity FROM inventory i JOIN products p ON i.product_id = p.id
         WHERE i.location_id = $1 AND p.name = $2 ORDER BY i.created_at ASC`,
        [locId, disc.item_description]
      );
      let remaining = adjustQty;
      for (const b of invRows.rows) {
        if (remaining <= 0) break;
        const deduct = Math.min(parseFloat(b.quantity), remaining);
        await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE id = $2', [deduct, b.id]);
        remaining -= deduct;
      }
    }

    const updated = await client.query(
      `UPDATE delivery_discrepancies SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Inventory adjusted and discrepancy completed', discrepancy: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally { client.release(); }
});

router.put('/:id/reject', auth, authorize('admin'), async (req, res) => {
  try {
    const { admin_note } = req.body;
    const discResult = await pool.query('SELECT * FROM delivery_discrepancies WHERE id = $1', [req.params.id]);
    if (!discResult.rows.length) return res.status(404).json({ error: 'Discrepancy not found' });
    if (discResult.rows[0].status !== 'pending') return res.status(400).json({ error: 'Already resolved' });
    const updated = await pool.query(
      `UPDATE delivery_discrepancies SET status='rejected', resolved_by=$1, resolved_at=CURRENT_TIMESTAMP, admin_note=$2 WHERE id=$3 RETURNING *`,
      [req.user.id, admin_note?.trim() || null, req.params.id]
    );
    res.json({ message: 'Discrepancy rejected', discrepancy: updated.rows[0] });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
