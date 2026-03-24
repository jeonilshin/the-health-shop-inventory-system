const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { notifyAdmins, notifyLocation } = require('./notifications');
const { logAudit } = require('../middleware/auditLog');

// ── GET all discrepancies (role-filtered) ──────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT dd.*,
        bl.name  AS branch_name,
        wl.name  AS warehouse_name,
        ru.full_name AS reported_by_name,
        rv.full_name AS resolved_by_name,
        d.delivery_date
      FROM delivery_discrepancies dd
      LEFT JOIN locations bl ON dd.branch_location_id    = bl.id
      LEFT JOIN locations wl ON dd.warehouse_location_id = wl.id
      LEFT JOIN users     ru ON dd.reported_by  = ru.id
      LEFT JOIN users     rv ON dd.resolved_by  = rv.id
      LEFT JOIN deliveries d ON dd.delivery_id  = d.id
      WHERE 1=1
    `;

    const params = [];
    let p = 1;

    if (req.user.role === 'branch_manager' || req.user.role === 'branch_staff') {
      query += ` AND dd.branch_location_id = $${p++}`;
      params.push(req.user.location_id);
    } else if (req.user.role === 'warehouse') {
      query += ` AND dd.warehouse_location_id = $${p++}`;
      params.push(req.user.location_id);
    }
    // admin sees all

    query += ' ORDER BY dd.reported_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET pending count (admin badge) ───────────────────────────────────────
router.get('/pending-count', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) FROM delivery_discrepancies WHERE status = 'pending'"
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST create discrepancy (shortage or return) ───────────────────────────
router.post('/', auth, authorize('admin', 'branch_manager'), async (req, res) => {
  try {
    const {
      type,
      delivery_id,
      item_description,
      unit,
      unit_cost,
      expected_quantity,
      received_quantity,
      note,
      branch_location_id,
      warehouse_location_id
    } = req.body;

    // ── Validate required fields ──
    if (!type || !item_description?.trim() || !unit?.trim() ||
        expected_quantity == null || received_quantity == null || !note?.trim()) {
      return res.status(400).json({ error: 'All fields are required including note' });
    }

    if (!['shortage', 'return'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "shortage" or "return"' });
    }

    if (type === 'shortage') {
      if (!delivery_id) {
        return res.status(400).json({ error: 'delivery_id is required for shortage reports' });
      }
      if (parseFloat(received_quantity) >= parseFloat(expected_quantity)) {
        return res.status(400).json({ error: 'Received quantity must be less than expected quantity' });
      }
    }

    if (type === 'return' && parseFloat(received_quantity) <= 0) {
      return res.status(400).json({ error: 'Return quantity must be greater than zero' });
    }

    if (!warehouse_location_id) {
      return res.status(400).json({ error: 'warehouse_location_id is required' });
    }

    const branchLocId = branch_location_id || req.user.location_id;

    // ── For shortage: verify delivery exists and is delivered ──
    if (type === 'shortage') {
      const deliveryCheck = await pool.query(
        "SELECT id FROM deliveries WHERE id = $1 AND status = 'delivered'",
        [delivery_id]
      );
      if (deliveryCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Delivery not found or not yet marked as delivered' });
      }
    }

    const result = await pool.query(`
      INSERT INTO delivery_discrepancies
        (type, delivery_id, item_description, unit, unit_cost,
         expected_quantity, received_quantity, note,
         branch_location_id, warehouse_location_id, reported_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      type,
      delivery_id || null,
      item_description.trim(),
      unit.trim(),
      unit_cost || null,
      parseFloat(expected_quantity),
      parseFloat(received_quantity),
      note.trim(),
      branchLocId,
      parseInt(warehouse_location_id),
      req.user.id
    ]);

    const disc = result.rows[0];

    // Fetch branch name for notification message
    const branchInfo = await pool.query('SELECT name FROM locations WHERE id = $1', [branchLocId]);
    const branchName = branchInfo.rows[0]?.name || 'Branch';

    const typeLabel  = type === 'shortage' ? 'Shortage Report'  : 'Return Request';
    const actionDesc = type === 'shortage'
      ? `Shortage: ${item_description} — expected ${expected_quantity}, received ${received_quantity} ${unit}`
      : `Return Request: ${received_quantity} ${unit} of ${item_description} from ${branchName}`;

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: type === 'shortage' ? 'DISCREPANCY_REPORT' : 'RETURN_REQUEST',
      tableName: 'delivery_discrepancies',
      recordId: disc.id,
      newValues: disc,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: actionDesc
    });

    // Notify all admins
    await notifyAdmins(
      type === 'shortage' ? 'shortage_report' : 'return_request',
      `${typeLabel} Filed by ${branchName}`,
      `${item_description}: ${actionDesc}. Needs your review.`,
      '/deliveries'
    );

    res.status(201).json(disc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id/approve ───────────────────────────────────────────────────────
// Admin approves the discrepancy - NO inventory movement yet
router.put('/:id/approve', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_note } = req.body;

    const discResult = await pool.query(
      'SELECT * FROM delivery_discrepancies WHERE id = $1',
      [id]
    );

    if (discResult.rows.length === 0) {
      return res.status(404).json({ error: 'Discrepancy not found' });
    }

    const disc = discResult.rows[0];

    if (disc.status !== 'pending') {
      return res.status(400).json({ error: 'Discrepancy has already been resolved' });
    }

    // Just mark as approved - NO inventory movement
    const updated = await pool.query(
      `UPDATE delivery_discrepancies
       SET status = 'approved',
           resolved_by = $1,
           resolved_at = CURRENT_TIMESTAMP,
           admin_note  = $2
       WHERE id = $3
       RETURNING *`,
      [req.user.id, admin_note?.trim() || null, id]
    );

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DISCREPANCY_APPROVE',
      tableName: 'delivery_discrepancies',
      recordId: id,
      newValues: updated.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Approved ${disc.type} for "${disc.item_description}" - Awaiting inventory addition`
    });

    // Notify branch
    const typeLabel = disc.type === 'shortage' ? 'Shortage report' : 'Return request';
    await notifyLocation(
      disc.branch_location_id,
      'discrepancy_approved',
      `${typeLabel} Approved`,
      `Your ${disc.type} request for "${disc.item_description}" has been approved by admin.`,
      '/discrepancy'
    );

    res.json({
      message: 'Discrepancy approved. Click "Add to my inventory" to complete the process.',
      discrepancy: updated.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id/add-to-inventory ──────────────────────────────────────────────
// Admin adds the approved discrepancy items to warehouse inventory
router.put('/:id/add-to-inventory', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const discResult = await client.query(
      'SELECT * FROM delivery_discrepancies WHERE id = $1',
      [id]
    );

    if (discResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Discrepancy not found' });
    }

    const disc = discResult.rows[0];

    if (disc.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Discrepancy must be approved first' });
    }

    // Calculate adjustment quantity
    const adjustQty = disc.type === 'shortage'
      ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
      : parseFloat(disc.received_quantity);

    if (adjustQty <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Adjustment quantity must be positive' });
    }

    // Handle based on type
    if (disc.type === 'shortage') {
      // SHORTAGE: Add missing quantity to warehouse (branch already has correct amount)
      console.log(`[SHORTAGE] Adding ${adjustQty} ${disc.unit} of "${disc.item_description}" to warehouse ${disc.warehouse_location_id}`);
      
      const batchId = `DISC-SHORTAGE-${disc.id}-${Date.now()}`;
      await client.query(
        `INSERT INTO inventory
           (location_id, description, unit, quantity, unit_cost, cost_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (location_id, description, unit, cost_batch_id)
         DO UPDATE SET quantity = inventory.quantity + $4, updated_at = CURRENT_TIMESTAMP`,
        [
          disc.warehouse_location_id,
          disc.item_description,
          disc.unit,
          adjustQty,
          disc.unit_cost || 0,
          batchId
        ]
      );
      
      console.log(`[SHORTAGE] Successfully added to warehouse inventory`);

    } else {
      // RETURN: Deduct from branch and add to warehouse
      console.log(`[RETURN] Looking for item in branch ${disc.branch_location_id}: "${disc.item_description}" (${disc.unit})`);
      
      // Get ALL batches of this item in the branch (not just one)
      const branchInv = await client.query(
        `SELECT id, quantity, description, unit, cost_batch_id
         FROM inventory
         WHERE location_id = $1 
         AND LOWER(TRIM(description)) = LOWER(TRIM($2))
         AND LOWER(TRIM(unit)) = LOWER(TRIM($3))
         ORDER BY created_at ASC`,  // FIFO - oldest first
        [disc.branch_location_id, disc.item_description, disc.unit]
      );

      console.log(`[RETURN] Found ${branchInv.rows.length} batch(es) in branch inventory`);
      
      if (branchInv.rows.length === 0) {
        await client.query('ROLLBACK');
        
        // Debug: Show what's actually in the branch inventory
        const debugInv = await client.query(
          `SELECT description, unit, quantity FROM inventory WHERE location_id = $1 LIMIT 10`,
          [disc.branch_location_id]
        );
        console.log('[RETURN] Branch inventory items:', debugInv.rows);
        
        return res.status(400).json({
          error: `"${disc.item_description}" (${disc.unit}) not found in branch inventory. Please check the item exists in the branch.`
        });
      }

      // Calculate total available across all batches
      const totalAvailable = branchInv.rows.reduce((sum, batch) => sum + parseFloat(batch.quantity), 0);
      console.log(`[RETURN] Total available across all batches: ${totalAvailable} ${disc.unit}`);

      if (totalAvailable < adjustQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock in branch. Available: ${totalAvailable} ${disc.unit}, required: ${adjustQty}`
        });
      }

      // Deduct from batches using FIFO (First In First Out)
      let remainingToDeduct = adjustQty;
      for (const batch of branchInv.rows) {
        if (remainingToDeduct <= 0) break;
        
        const batchQty = parseFloat(batch.quantity);
        const deductFromThisBatch = Math.min(batchQty, remainingToDeduct);
        
        console.log(`[RETURN] Deducting ${deductFromThisBatch} from batch ${batch.cost_batch_id} (has ${batchQty})`);
        
        if (deductFromThisBatch >= batchQty) {
          // Remove entire batch
          await client.query(
            `DELETE FROM inventory WHERE id = $1`,
            [batch.id]
          );
          console.log(`[RETURN] Deleted entire batch ${batch.cost_batch_id}`);
        } else {
          // Partial deduction
          await client.query(
            `UPDATE inventory
             SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [deductFromThisBatch, batch.id]
          );
          console.log(`[RETURN] Reduced batch ${batch.cost_batch_id} by ${deductFromThisBatch}`);
        }
        
        remainingToDeduct -= deductFromThisBatch;
      }

      console.log(`[RETURN] Successfully deducted ${adjustQty} from branch. Adding to warehouse ${disc.warehouse_location_id}`);
      
      // Add to warehouse
      const batchId = `DISC-RETURN-${disc.id}-${Date.now()}`;
      await client.query(
        `INSERT INTO inventory
           (location_id, description, unit, quantity, unit_cost, cost_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (location_id, description, unit, cost_batch_id)
         DO UPDATE SET quantity = inventory.quantity + $4, updated_at = CURRENT_TIMESTAMP`,
        [
          disc.warehouse_location_id,
          disc.item_description,
          disc.unit,
          adjustQty,
          disc.unit_cost || 0,
          batchId
        ]
      );
      
      console.log(`[RETURN] Successfully completed return process - ${adjustQty} ${disc.unit} moved from branch to warehouse`);
    }

    // Mark as completed
    const updated = await client.query(
      `UPDATE delivery_discrepancies
       SET status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DISCREPANCY_COMPLETE',
      tableName: 'delivery_discrepancies',
      recordId: id,
      newValues: updated.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: disc.type === 'shortage'
        ? `Added ${adjustQty} ${disc.unit} of "${disc.item_description}" to warehouse inventory (shortage)`
        : `Returned ${adjustQty} ${disc.unit} of "${disc.item_description}" from branch to warehouse`
    });

    // Notify branch
    const typeLabel = disc.type === 'shortage' ? 'Shortage' : 'Return';
    await notifyLocation(
      disc.branch_location_id,
      'discrepancy_completed',
      `${typeLabel} Completed`,
      `${typeLabel} for "${disc.item_description}" has been completed. ${disc.type === 'return' ? 'Items removed from your inventory.' : ''}`,
      '/discrepancy'
    );

    res.json({
      message: disc.type === 'shortage'
        ? `Added ${adjustQty} ${disc.unit} of "${disc.item_description}" to warehouse inventory`
        : `Returned ${adjustQty} ${disc.unit} of "${disc.item_description}" to warehouse. Removed from branch.`,
      discrepancy: updated.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ── PUT /:id/reject ────────────────────────────────────────────────────────
router.put('/:id/reject', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_note } = req.body;

    const discResult = await pool.query(
      'SELECT * FROM delivery_discrepancies WHERE id = $1',
      [id]
    );

    if (discResult.rows.length === 0) {
      return res.status(404).json({ error: 'Discrepancy not found' });
    }

    const disc = discResult.rows[0];

    if (disc.status !== 'pending') {
      return res.status(400).json({ error: 'Discrepancy has already been resolved' });
    }

    const updated = await pool.query(
      `UPDATE delivery_discrepancies
       SET status = 'rejected',
           resolved_by = $1,
           resolved_at = CURRENT_TIMESTAMP,
           admin_note  = $2
       WHERE id = $3
       RETURNING *`,
      [req.user.id, admin_note?.trim() || null, id]
    );

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DISCREPANCY_REJECT',
      tableName: 'delivery_discrepancies',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Rejected ${disc.type} for "${disc.item_description}"${admin_note ? ` — reason: ${admin_note}` : ''}`
    });

    // Notify branch
    const typeLabel = disc.type === 'shortage' ? 'Shortage report' : 'Return request';
    await notifyLocation(
      disc.branch_location_id,
      'discrepancy_rejected',
      `${typeLabel} Rejected`,
      `Your ${disc.type} request for "${disc.item_description}" was rejected.${admin_note ? ` Reason: ${admin_note}` : ''}`,
      '/deliveries'
    );

    res.json({
      message: 'Discrepancy rejected',
      discrepancy: updated.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
