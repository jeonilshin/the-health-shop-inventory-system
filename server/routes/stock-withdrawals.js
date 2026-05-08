const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');
const { notifyAdmins } = require('./notifications');
const { cleanupZeroInventory } = require('../utils/inventoryCleanup');

const ALLOWED_TYPES = ['employee_purchase', 'principal', 'outside_party'];
const TYPE_LABEL = {
  employee_purchase: 'Employee Purchase',
  principal:         'Principal / Owner',
  outside_party:     'Outside Party (DFA)'
};

// ── GET list ─────────────────────────────────────────────────────────────
// Admin: every withdrawal across the company.
// Branch staff/manager/warehouse: only withdrawals from their own location.
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, locationId, type } = req.query;

    let query = `
      SELECT sw.*,
             l.name AS location_name,
             l.type AS location_type,
             u.full_name AS withdrawn_by_full_name
        FROM stock_withdrawals sw
        JOIN locations l ON sw.location_id = l.id
   LEFT JOIN users     u ON sw.withdrawn_by = u.id
       WHERE 1=1
    `;
    const params = [];
    let p = 1;

    if (req.user.role === 'branch_manager') {
      const { getManagerLocations } = require('../middleware/auth');
      const managerLocations = await getManagerLocations(req.user.id, 'branch_manager');
      const allowedIds = managerLocations.map(l => l.id);
      if (allowedIds.length === 0) return res.json([]);
      if (locationId && allowedIds.includes(parseInt(locationId))) {
        query += ` AND sw.location_id = $${p++}`;
        params.push(parseInt(locationId));
      } else {
        query += ` AND sw.location_id = ANY($${p++})`;
        params.push(allowedIds);
      }
    } else if (req.user.role !== 'admin') {
      query += ` AND sw.location_id = $${p++}`;
      params.push(req.user.location_id);
    } else if (locationId) {
      query += ` AND sw.location_id = $${p++}`;
      params.push(parseInt(locationId));
    }

    if (type && ALLOWED_TYPES.includes(type)) {
      query += ` AND sw.withdrawal_type = $${p++}`;
      params.push(type);
    }
    if (startDate) {
      query += ` AND sw.withdrawn_at >= $${p++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND sw.withdrawn_at <= $${p++}`;
      params.push(endDate + ' 23:59:59');
    }

    query += ' ORDER BY sw.withdrawn_at DESC LIMIT 500';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST create ──────────────────────────────────────────────────────────
// Pulls inventory immediately (FIFO across cost batches), records the
// withdrawal, and notifies all admins. No approval step — the client wants
// the item gone the moment it physically leaves.
router.post('/', auth, authorize('admin', 'warehouse', 'branch_manager', 'branch_staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      location_id,
      item_description,
      unit,
      quantity,
      withdrawal_type,
      recipient_name,
      notes,
      batch_id
    } = req.body;

    if (!location_id || !item_description?.trim() || !unit?.trim()) {
      return res.status(400).json({ error: 'Item description, unit and location are required' });
    }
    const qty = parseFloat(quantity);
    if (!(qty > 0)) {
      return res.status(400).json({ error: 'Quantity must be greater than zero' });
    }
    if (!ALLOWED_TYPES.includes(withdrawal_type)) {
      return res.status(400).json({ error: 'Invalid withdrawal_type' });
    }
    if (!recipient_name?.trim()) {
      return res.status(400).json({ error: 'Recipient name is required so the admin knows who took the item' });
    }
    if (req.user.role !== 'admin' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'You can only withdraw from your assigned location' });
    }

    await client.query('BEGIN');

    let batchesResult;
    
    // If specific batch is selected, only get that batch
    if (batch_id) {
      batchesResult = await client.query(
        `SELECT id, quantity, unit_cost
           FROM inventory
          WHERE id = $1
            AND location_id = $2
            AND LOWER(TRIM(description)) = LOWER(TRIM($3))
            AND LOWER(TRIM(unit))        = LOWER(TRIM($4))
            AND quantity > 0
          FOR UPDATE`,
        [batch_id, location_id, item_description, unit]
      );
      
      if (batchesResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected batch not found or out of stock' });
      }
    } else {
      // Find all batches of this item at the location, FIFO by created_at
      batchesResult = await client.query(
        `SELECT id, quantity, unit_cost
           FROM inventory
          WHERE location_id = $1
            AND LOWER(TRIM(description)) = LOWER(TRIM($2))
            AND LOWER(TRIM(unit))        = LOWER(TRIM($3))
            AND quantity > 0
          ORDER BY created_at ASC
          FOR UPDATE`,
        [location_id, item_description, unit]
      );
    }

    if (batchesResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Item not found at this location or out of stock' });
    }

    const totalAvailable = batchesResult.rows.reduce((s, b) => s + parseFloat(b.quantity), 0);
    if (totalAvailable < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Only ${totalAvailable} ${unit} available, requested ${qty}`
      });
    }

    let remaining = qty;
    let firstInventoryId = batchesResult.rows[0].id;
    let firstUnitCost    = batchesResult.rows[0].unit_cost;

    for (const batch of batchesResult.rows) {
      if (remaining <= 0) break;
      const have   = parseFloat(batch.quantity);
      const deduct = Math.min(have, remaining);
      if (deduct >= have) {
        await client.query('DELETE FROM inventory WHERE id = $1', [batch.id]);
      } else {
        await client.query(
          'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [deduct, batch.id]
        );
        // Auto-cleanup if quantity reached zero
        await cleanupZeroInventory(client, batch.id);
      }
      remaining -= deduct;
    }

    const insert = await client.query(
      `INSERT INTO stock_withdrawals
         (location_id, inventory_id, item_description, unit, quantity, unit_cost,
          withdrawal_type, recipient_name, notes, withdrawn_by, withdrawn_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        location_id, firstInventoryId, item_description.trim(), unit.trim(), qty,
        firstUnitCost || null,
        withdrawal_type, recipient_name.trim(), notes?.trim() || null,
        req.user.id, req.user.full_name || req.user.username
      ]
    );

    await client.query('COMMIT');

    const locInfo = await pool.query('SELECT name, type FROM locations WHERE id = $1', [location_id]);
    const locName = locInfo.rows[0]?.name || 'Location';
    const locKind = locInfo.rows[0]?.type || 'location';
    const typeLabel = TYPE_LABEL[withdrawal_type];

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'STOCK_WITHDRAWAL',
      tableName: 'stock_withdrawals',
      recordId: insert.rows[0].id,
      newValues: insert.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `${typeLabel} pull-out: ${qty} ${unit} of "${item_description}" from ${locName} to ${recipient_name}`
    });

    await notifyAdmins(
      'stock_withdrawal',
      `Stock Pull-out at ${locName}`,
      `${req.user.full_name || req.user.username} pulled out ${qty} ${unit} of "${item_description}" from ${locKind} ${locName} for ${typeLabel} (recipient: ${recipient_name}).`,
      '/stock-withdrawals'
    );

    res.status(201).json(insert.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ── DELETE single (admin only) ───────────────────────────────────────────
// Reverses the stock by adding the quantity back to the most recent batch
// (or creating a new batch row if the item has been fully consumed).
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const wResult = await client.query('SELECT * FROM stock_withdrawals WHERE id = $1', [id]);
    if (wResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal not found' });
    }
    const w = wResult.rows[0];

    const batch = await client.query(
      `SELECT id FROM inventory
        WHERE location_id = $1
          AND LOWER(TRIM(description)) = LOWER(TRIM($2))
          AND LOWER(TRIM(unit))        = LOWER(TRIM($3))
        ORDER BY created_at DESC LIMIT 1`,
      [w.location_id, w.item_description, w.unit]
    );
    if (batch.rows.length > 0) {
      await client.query(
        'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [w.quantity, batch.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, cost_batch_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [w.location_id, w.item_description, w.unit, w.quantity, w.unit_cost || 0, `WITHDRAWAL-REVERT-${w.id}-${Date.now()}`]
      );
    }

    await client.query('DELETE FROM stock_withdrawals WHERE id = $1', [id]);
    await client.query('COMMIT');

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'STOCK_WITHDRAWAL_DELETED',
      tableName: 'stock_withdrawals',
      recordId: id,
      oldValues: w,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Reverted withdrawal of ${w.quantity} ${w.unit} of "${w.item_description}" — stock restored to ${w.location_id}`
    });

    res.json({ message: 'Withdrawal reversed and stock restored' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
