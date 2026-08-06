const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { notifyLocation } = require('./notifications');
const { logAudit } = require('../middleware/auditLog');
const { restoreTransferToSource } = require('../utils/inventoryRestore');

// ── Reservation helpers (standalone deliveries) ────────────────────────────
// Standalone deliveries reserve warehouse stock the moment they are created/sent.
// reserveFromSource FIFO-consumes source batches and returns the exact breakdown
// so accept can recreate the destination lots and edit/delete/reject can restore.

// Consume `quantity` of an item from a source location using FIFO (soonest expiry
// first, then oldest created). Decrements each source batch row and returns the
// list of { cost_batch_id, quantity, unit_cost, suggested_selling_price,
// batch_number, expiry_date } consumed. Throws if there is not enough stock.
async function reserveFromSource(client, fromLocationId, item) {
  const description = item.description;
  const unit = item.unit;
  let remaining = parseFloat(item.quantity);

  if (!(remaining > 0)) return [];

  const sourceBatches = await client.query(
    `SELECT id, cost_batch_id, quantity, unit_cost, suggested_selling_price,
            batch_number, expiry_date
       FROM inventory
      WHERE location_id = $1 AND description = $2 AND unit = $3 AND quantity > 0
      ORDER BY
        CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
        expiry_date ASC NULLS LAST,
        created_at ASC`,
    [fromLocationId, description, unit]
  );

  const reserved = [];
  for (const batch of sourceBatches.rows) {
    if (remaining <= 0) break;
    const batchQty = parseFloat(batch.quantity);
    const takeQty = Math.min(batchQty, remaining);
    if (takeQty <= 0) continue;

    await client.query(
      `UPDATE inventory
          SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [takeQty, batch.id]
    );

    reserved.push({
      cost_batch_id: batch.cost_batch_id,
      quantity: takeQty,
      unit_cost: batch.unit_cost,
      suggested_selling_price: batch.suggested_selling_price,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
    });

    remaining -= takeQty;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient stock for "${description}" (${unit}). Missing ${remaining} to reserve.`
    );
  }

  return reserved;
}

// Put a previously reserved breakdown back into the source location (edit/delete/reject).
// `description`/`unit` come from the delivery_items row that owns this breakdown.
async function restoreReservedToSource(client, fromLocationId, description, unit, reservedBatches) {
  if (!Array.isArray(reservedBatches)) return;
  for (const b of reservedBatches) {
    const qty = parseFloat(b.quantity);
    if (!(qty > 0)) continue;
    await client.query(
      `INSERT INTO inventory (
         location_id, description, unit, quantity, unit_cost,
         suggested_selling_price, cost_batch_id, batch_number, expiry_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (location_id, description, unit, cost_batch_id)
       DO UPDATE SET
         quantity = inventory.quantity + $4,
         updated_at = CURRENT_TIMESTAMP`,
      [
        fromLocationId,
        description,
        unit,
        qty,
        b.unit_cost,
        b.suggested_selling_price != null ? b.suggested_selling_price : b.unit_cost,
        b.cost_batch_id || `RESTORE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        b.batch_number || null,
        b.expiry_date || null,
      ]
    );
  }
}

// Get all deliveries with items
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    
    // First, auto-sync any deliveries that are out of sync with their transfer status
    await pool.query(`
      UPDATE deliveries d
      SET 
        status = 'delivered',
        delivered_date = COALESCE(d.delivered_date, t.delivered_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      FROM transfers t
      WHERE d.transfer_id = t.id
        AND t.status = 'delivered'
        AND d.status IN ('in_transit', 'admin_confirmed', 'awaiting_admin')
        AND d.transfer_id IS NOT NULL
    `);
    
    let query = `
      SELECT d.*, 
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as created_by_name,
        au.full_name as admin_confirmed_by_name,
        t.id as transfer_id,
        t.status as transfer_status,
        COALESCE(
          json_agg(
            json_build_object(
              'id', di.id,
              'description', di.description,
              'unit', di.unit,
              'quantity', di.quantity,
              'unit_cost', di.unit_cost,
              'notes', di.notes
            )
          ) FILTER (WHERE di.id IS NOT NULL), '[]'
        ) as items,
        COALESCE(SUM(di.quantity * COALESCE(di.unit_cost, 0)), 0) as total_value
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
    let paramCount = 1;
    
    // Filter by user role
    if (req.user.role === 'branch_manager' || req.user.role === 'branch_staff') {
      query += ` AND d.to_location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (req.user.role === 'warehouse') {
      query += ` AND d.from_location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    }
    
    if (status) {
      query += ` AND d.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    query += ' GROUP BY d.id, fl.name, tl.name, u.full_name, au.full_name, t.id, t.status';

    // For admin/audit/warehouse: also surface warehouse→branch transfers that were
    // never linked to a deliveries record (approved directly or via CDR import).
    // This makes old movements (e.g. April 24, May 6) traceable from this page.
    let transferRows = [];
    if (req.user.role === 'admin' || req.user.role === 'audit' || req.user.role === 'warehouse') {
      const tConditions = [
        `fl.type = 'warehouse'`,
        `tl.type = 'branch'`,
        `NOT EXISTS (SELECT 1 FROM deliveries dd WHERE dd.transfer_id = t.id)`
      ];
      const tParams = [];
      let tIdx = 1;

      if (req.user.role === 'warehouse') {
        tConditions.push(`t.from_location_id = $${tIdx++}`);
        tParams.push(req.user.location_id);
      }
      if (status) {
        const mappedStatus = (status === 'delivered') ? "'delivered','approved'" : `'${status}'`;
        tConditions.push(`t.status IN (${mappedStatus})`);
      }

      const tResult = await pool.query(`
        SELECT
          t.id,
          t.from_location_id,
          t.to_location_id,
          fl.name  AS from_location_name,
          tl.name  AS to_location_name,
          u.full_name AS created_by_name,
          NULL::text  AS admin_confirmed_by_name,
          t.id        AS transfer_id,
          t.status    AS transfer_status,
          CASE t.status WHEN 'approved' THEN 'delivered' ELSE t.status END AS status,
          COALESCE(t.transfer_date, t.created_at) AS created_at,
          COALESCE(t.transfer_date, t.created_at) AS delivery_date,
          NULL::timestamp AS delivered_date,
          t.transferred_by AS created_by,
          true AS is_transfer_only,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'id', ti.id, 'description', ti.description,
               'unit', ti.unit, 'quantity', ti.quantity, 'unit_cost', ti.unit_cost
             )) FROM transfer_items ti WHERE ti.transfer_id = t.id),
            json_build_array(json_build_object(
              'id', t.id, 'description', t.description,
              'unit', t.unit, 'quantity', t.quantity, 'unit_cost', t.unit_cost
            ))
          ) AS items,
          COALESCE(
            (SELECT SUM(ti.quantity * COALESCE(ti.unit_cost, 0))
             FROM transfer_items ti WHERE ti.transfer_id = t.id),
            t.quantity * COALESCE(t.unit_cost, 0)
          ) AS total_value
        FROM transfers t
        LEFT JOIN locations fl ON t.from_location_id = fl.id
        LEFT JOIN locations tl ON t.to_location_id = tl.id
        LEFT JOIN users u ON t.transferred_by = u.id
        WHERE ${tConditions.join(' AND ')}
        ORDER BY COALESCE(t.transfer_date, t.created_at) DESC
      `, tParams);

      transferRows = tResult.rows;
    }

    const deliveryRows = (await pool.query(query + ' ORDER BY d.created_at DESC', params)).rows;
    const combined = [...deliveryRows, ...transferRows].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    res.json(combined);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get delivery by ID with items
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT d.*, 
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as created_by_name,
        json_agg(
          json_build_object(
            'id', di.id,
            'description', di.description,
            'unit', di.unit,
            'quantity', di.quantity,
            'unit_cost', di.unit_cost,
            'notes', di.notes
          )
        ) as items
      FROM deliveries d
      LEFT JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE d.id = $1
      GROUP BY d.id, fl.name, tl.name, u.full_name
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create delivery (items must exist in source inventory)
router.post('/', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      from_location_id,
      to_location_id,
      delivery_date,
      status,
      notes,
      items
    } = req.body;
    
    // Validate items exist in source inventory
    if (!items || items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one item is required' });
    }
    
    // Check all items exist in source inventory with sufficient quantity
    for (const item of items) {
      const inventoryCheck = await client.query(
        'SELECT quantity, unit_cost FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
        [from_location_id, item.description, item.unit]
      );
      
      if (inventoryCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          error: `Item "${item.description}" not found in source location inventory` 
        });
      }
      
      // Inventory stores one row per cost batch; depleted batches remain as
      // 0-qty rows. Sum across all rows for the true available quantity.
      const availableQty = inventoryCheck.rows.reduce(
        (sum, r) => sum + parseFloat(r.quantity || 0), 0
      );

      if (availableQty < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient quantity for "${item.description}". Available: ${availableQty.toFixed(2)}, Requested: ${item.quantity}`
        });
      }

      // Use unit_cost from a batch that still has stock (fall back to first row).
      const costRow = inventoryCheck.rows.find(r => parseFloat(r.quantity || 0) > 0)
        || inventoryCheck.rows[0];
      item.unit_cost = costRow.unit_cost;
    }
    
    // Create delivery
    const deliveryResult = await client.query(`
      INSERT INTO deliveries (
        from_location_id, to_location_id, delivery_date, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [from_location_id, to_location_id, delivery_date, status || 'pending', notes, req.user.id]);
    
    const delivery = deliveryResult.rows[0];
    
    // Add delivery items and reserve the stock from the source immediately.
    // The stock leaves the warehouse now ("reserved") and only lands in the branch
    // when the branch accepts. reserved_batches records exactly what was consumed so
    // accept can recreate the destination lots and edit/delete/reject can restore.
    for (const item of items) {
      const reservedBatches = await reserveFromSource(client, from_location_id, item);
      await client.query(`
        INSERT INTO delivery_items (delivery_id, description, unit, quantity, unit_cost, notes, reserved_batches)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [delivery.id, item.description, item.unit, item.quantity, item.unit_cost, item.notes || null,
          JSON.stringify(reservedBatches)]);
    }

    await client.query(
      `UPDATE deliveries SET stock_reserved = true WHERE id = $1`,
      [delivery.id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_CREATE',
      tableName: 'deliveries',
      recordId: delivery.id,
      newValues: { ...delivery, items },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Created delivery with ${items.length} item(s)`
    });
    
    // Fetch complete delivery with items
    const completeDelivery = await pool.query(`
      SELECT d.*, 
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as created_by_name,
        json_agg(
          json_build_object(
            'id', di.id,
            'description', di.description,
            'unit', di.unit,
            'quantity', di.quantity,
            'unit_cost', di.unit_cost
          )
        ) as items
      FROM deliveries d
      LEFT JOIN locations fl ON d.from_location_id = fl.id
      LEFT JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE d.id = $1
      GROUP BY d.id, fl.name, tl.name, u.full_name
    `, [delivery.id]);
    
    res.status(201).json(completeDelivery.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Update a delivery. Two modes:
//   * EDIT ITEMS  (body.items present): re-write the item list for a delivery the
//     branch has not received yet. Old reserved stock is returned to the warehouse
//     and the new item list is reserved fresh — same logic as sending, so a mis-sent
//     delivery can be corrected in place instead of delete-and-resend.
//   * STATUS ONLY (body.status only): update the status field.
router.put('/:id', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, items, delivery_date, notes } = req.body;

    await client.query('BEGIN');

    // Get delivery details with its items (including the reserved breakdown per item)
    const delivery = await client.query(
      `SELECT d.*,
              COALESCE(json_agg(json_build_object(
                'id', di.id,
                'description', di.description,
                'unit', di.unit,
                'quantity', di.quantity,
                'unit_cost', di.unit_cost,
                'reserved_batches', di.reserved_batches
              )) FILTER (WHERE di.id IS NOT NULL), '[]') as items
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.id = $1
       GROUP BY d.id`,
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    // ── EDIT ITEMS mode ──────────────────────────────────────────────────────
    if (Array.isArray(items)) {
      if (items.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A delivery must have at least one item' });
      }

      // Only editable before the branch receives it.
      if (['delivered', 'rejected', 'cancelled'].includes(deliveryData.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Cannot edit a ${deliveryData.status} delivery. The branch has already received or it was closed.`
        });
      }

      // Transfer-linked deliveries are driven by the transfer record, not here.
      if (deliveryData.transfer_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This delivery is linked to a transfer and cannot be edited here.' });
      }

      // 1) Return everything currently reserved back to the warehouse.
      if (deliveryData.stock_reserved) {
        for (const old of deliveryData.items) {
          await restoreReservedToSource(
            client, deliveryData.from_location_id, old.description, old.unit, old.reserved_batches
          );
        }
      }

      // 2) Validate the new list has enough stock (post-restore) and resolve unit cost.
      for (const item of items) {
        const invCheck = await client.query(
          'SELECT quantity, unit_cost FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
          [deliveryData.from_location_id, item.description, item.unit]
        );
        if (invCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Item "${item.description}" not found in warehouse inventory` });
        }
        const available = invCheck.rows.reduce((sum, r) => sum + parseFloat(r.quantity || 0), 0);
        if (available < parseFloat(item.quantity)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Insufficient quantity for "${item.description}". Available: ${available.toFixed(2)}, Requested: ${item.quantity}`
          });
        }
        const costRow = invCheck.rows.find(r => parseFloat(r.quantity || 0) > 0) || invCheck.rows[0];
        item.unit_cost = costRow.unit_cost;
      }

      // 3) Replace the item rows and reserve the new quantities.
      await client.query('DELETE FROM delivery_items WHERE delivery_id = $1', [id]);
      for (const item of items) {
        const reservedBatches = await reserveFromSource(client, deliveryData.from_location_id, item);
        await client.query(
          `INSERT INTO delivery_items (delivery_id, description, unit, quantity, unit_cost, notes, reserved_batches)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, item.description, item.unit, item.quantity, item.unit_cost, item.notes || null,
           JSON.stringify(reservedBatches)]
        );
      }

      const updated = await client.query(
        `UPDATE deliveries
            SET stock_reserved = true,
                delivery_date = COALESCE($2, delivery_date),
                notes = COALESCE($3, notes),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *`,
        [id, delivery_date || null, notes != null ? notes : null]
      );

      await client.query('COMMIT');

      await logAudit({
        userId: req.user.id,
        username: req.user.username,
        action: 'DELIVERY_EDIT',
        tableName: 'deliveries',
        recordId: id,
        oldValues: { items: deliveryData.items },
        newValues: { items },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        description: `Edited delivery items (${items.length} item(s)) - stock returned and re-reserved`
      });

      return res.json(updated.rows[0]);
    }

    // ── STATUS ONLY mode ─────────────────────────────────────────────────────
    // Receiving now happens exclusively through POST /:id/accept (which adds the
    // reserved stock to the branch), so a plain status change never moves inventory.
    const result = await client.query(
      'UPDATE deliveries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    await client.query('COMMIT');

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_UPDATE',
      tableName: 'deliveries',
      recordId: id,
      oldValues: { status: deliveryData.status },
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated delivery status to ${status}`
    });

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Delete delivery (admin or warehouse, only before the branch has received it).
// Any reserved stock is returned to the warehouse first.
router.delete('/:id', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Load the delivery and its items (with the reserved breakdown) up front.
    const delivery = await client.query(
      `SELECT d.*,
              COALESCE(json_agg(json_build_object(
                'description', di.description,
                'unit', di.unit,
                'reserved_batches', di.reserved_batches
              )) FILTER (WHERE di.id IS NOT NULL), '[]') as items
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.id = $1
       GROUP BY d.id`,
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    if (deliveryData.status === 'delivered') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot delete a delivered delivery. Inventory has already been updated.' });
    }

    // Return reserved stock to the warehouse before removing the delivery.
    // Transfer-linked deliveries are restored via the transfer flow, not here.
    let stockRestored = false;
    if (deliveryData.stock_reserved && !deliveryData.transfer_id) {
      for (const item of deliveryData.items) {
        await restoreReservedToSource(
          client, deliveryData.from_location_id, item.description, item.unit, item.reserved_batches
        );
      }
      stockRestored = true;
    }

    await client.query('DELETE FROM deliveries WHERE id = $1', [id]);

    await client.query('COMMIT');

    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_DELETE',
      tableName: 'deliveries',
      recordId: id,
      oldValues: { status: deliveryData.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted delivery (status: ${deliveryData.status})${stockRestored ? ' - reserved stock returned to warehouse' : ''}`
    });

    res.json({
      message: stockRestored
        ? 'Delivery deleted. Reserved stock was returned to the warehouse.'
        : 'Delivery deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Admin confirms delivery (allows branch to see it)
router.post('/:id/admin-confirm', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const delivery = await client.query(
      'SELECT * FROM deliveries WHERE id = $1',
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    // Directly-created deliveries (warehouse "Create Delivery" / branch
    // "Request from Warehouse") start as 'pending'; transfer-shipped ones start
    // as 'awaiting_admin'. The admin confirms either into 'admin_confirmed'.
    if (deliveryData.status !== 'awaiting_admin' && deliveryData.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Delivery is not awaiting admin confirmation' });
    }

    // Update delivery status
    await client.query(
      `UPDATE deliveries 
       SET status = 'admin_confirmed', 
           admin_confirmed = true,
           admin_confirmed_by = $1,
           admin_confirmed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.id, id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_ADMIN_CONFIRM',
      tableName: 'deliveries',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Admin confirmed delivery - Ready for branch acceptance`
    });
    
    // Notify branch about confirmed delivery
    const locationInfo = await client.query(
      'SELECT name FROM locations WHERE id = $1',
      [deliveryData.to_location_id]
    );
    
    await notifyLocation(
      deliveryData.to_location_id,
      'delivery_confirmed',
      'Delivery Confirmed by Admin',
      `Delivery is on the way to ${locationInfo.rows[0]?.name}. Please accept when it arrives.`,
      '/deliveries'
    );
    
    res.json({ message: 'Delivery confirmed by admin. Branch can now see and accept it.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get available batches for delivery items (for batch selection during acceptance)
router.get('/:id/available-batches', auth, authorize('admin', 'branch_manager', 'branch_staff'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get delivery with items
    const delivery = await pool.query(
      `SELECT d.*, di.id as item_id, di.description, di.unit, di.quantity as requested_quantity,
              di.reserved_batches
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.id = $1`,
      [id]
    );
    
    if (delivery.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    const deliveryData = delivery.rows[0];
    
    // Check access
    if (req.user.role === 'branch_manager') {
      const { hasLocationAccess } = require('../middleware/auth');
      const hasAccess = await hasLocationAccess(req.user.id, req.user.role, deliveryData.to_location_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this delivery' });
      }
    } else if (req.user.role === 'branch_staff') {
      if (req.user.location_id != deliveryData.to_location_id) {
        return res.status(403).json({ error: 'Access denied to this delivery' });
      }
    }
    
    // Reserved (or transfer-linked) deliveries already pulled their stock out of the
    // source at send time, so the live source inventory reads 0 for those items. The
    // stock is not gone — it is held for THIS delivery in delivery_items.reserved_batches,
    // and accept recreates those exact lots at the destination (see accept Path A).
    // Surface the reserved lots as the "available batches" so the branch-side accept
    // check reflects reality instead of falsely reporting "no stock in the warehouse".
    const sourceAlreadyDeducted = !!deliveryData.transfer_id || !!deliveryData.stock_reserved;

    // For each item, get available batches from source location
    const itemsWithBatches = [];

    for (const item of delivery.rows) {
      if (item.description) {
        if (sourceAlreadyDeducted) {
          let reserved = item.reserved_batches;
          if (typeof reserved === 'string') {
            try { reserved = JSON.parse(reserved); } catch { reserved = null; }
          }
          const reservedRows = (Array.isArray(reserved) ? reserved : [])
            .filter(b => parseFloat(b.quantity) > 0)
            .map(b => ({
              id: null, // reserved lots have no live inventory row; accept ignores batch_ids here
              cost_batch_id: b.cost_batch_id,
              quantity: b.quantity,
              unit_cost: b.unit_cost,
              suggested_selling_price: b.suggested_selling_price,
              batch_number: b.batch_number,
              expiry_date: b.expiry_date,
            }));
          itemsWithBatches.push({
            item_id: item.item_id,
            description: item.description,
            unit: item.unit,
            requested_quantity: item.requested_quantity,
            available_batches: reservedRows,
          });
          continue;
        }

        const batches = await pool.query(
          `SELECT 
            id,
            cost_batch_id,
            quantity,
            unit_cost,
            suggested_selling_price,
            batch_number,
            expiry_date,
            created_at,
            CASE 
              WHEN expiry_date IS NULL THEN 'NO_EXPIRY'
              WHEN expiry_date < CURRENT_DATE THEN 'EXPIRED'
              WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
              ELSE 'GOOD'
            END as expiry_status
           FROM inventory
           WHERE location_id = $1 
             AND description = $2 
             AND unit = $3 
             AND quantity > 0
           ORDER BY 
             CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
             expiry_date ASC NULLS LAST,
             created_at ASC`,
          [deliveryData.from_location_id, item.description, item.unit]
        );
        
        itemsWithBatches.push({
          item_id: item.item_id,
          description: item.description,
          unit: item.unit,
          requested_quantity: item.requested_quantity,
          available_batches: batches.rows
        });
      }
    }
    
    res.json({
      delivery_id: deliveryData.id,
      from_location_id: deliveryData.from_location_id,
      to_location_id: deliveryData.to_location_id,
      // When true, stock is already reserved for this delivery and accept recreates
      // the reserved lots directly — no live-stock check or batch selection needed.
      stock_reserved: sourceAlreadyDeducted,
      items: itemsWithBatches
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Branch accepts delivery (completes the transfer) - Admin, Manager, or Staff (with manager confirmation)
// Branch accepts delivery (completes the transfer) - Admin, Manager, or Staff (with manager confirmation)
router.post('/:id/accept', auth, authorize('admin', 'branch_manager', 'branch_staff'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { batch_selections } = req.body; // Optional: array of { item_id, batch_ids: [id1, id2], quantities: [qty1, qty2] }

    await client.query('BEGIN');

    const delivery = await client.query(
      `SELECT d.*, di.id as item_id, di.description, di.unit, di.quantity, di.unit_cost, di.reserved_batches
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.id = $1`,
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    // Check if user has access to destination location
    const { hasLocationAccess } = require('../middleware/auth');
    
    if (req.user.role === 'branch_manager') {
      const hasAccess = await hasLocationAccess(req.user.id, req.user.role, deliveryData.to_location_id);
      if (!hasAccess) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied to this delivery' });
      }
    } else if (req.user.role === 'branch_staff') {
      if (req.user.location_id != deliveryData.to_location_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied to this delivery' });
      }
    }

    // Check delivery status - must be admin_confirmed or in_transit
    if (deliveryData.status !== 'admin_confirmed' && deliveryData.status !== 'in_transit') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot accept delivery with status "${deliveryData.status}". Delivery must be confirmed by admin first.`
      });
    }

    // The warehouse stock is already gone from the source when EITHER:
    //   * the delivery is linked to a transfer (deducted at transfer approval), or
    //   * the delivery reserved its stock at send time (stock_reserved = true).
    // In both cases accept only ADDS to the destination — never deducts again.
    // (Legacy deliveries created before the reservation model still fall through to
    //  Path B below, which pulls stock from the source at accept time.)
    const sourceAlreadyDeducted = !!deliveryData.transfer_id || !!deliveryData.stock_reserved;

    // Pre-validate all items before making any inventory changes
    // (only when we still need to pull stock from the source)
    const validationErrors = [];
    if (!sourceAlreadyDeducted) {
      for (const item of delivery.rows) {
        if (!item.description) continue;
        const itemSelection = batch_selections?.find(sel => sel.item_id === item.item_id);
        if (itemSelection && itemSelection.batch_ids?.length > 0) {
          for (let i = 0; i < itemSelection.batch_ids.length; i++) {
            const batchCheck = await client.query(
              'SELECT quantity FROM inventory WHERE id = $1 AND location_id = $2',
              [itemSelection.batch_ids[i], deliveryData.from_location_id]
            );
            if (batchCheck.rows.length === 0) {
              validationErrors.push(`${item.description} (${item.unit}): selected batch not found in warehouse`);
            } else if (parseFloat(batchCheck.rows[0].quantity) < parseFloat(itemSelection.quantities[i])) {
              validationErrors.push(`${item.description} (${item.unit}): batch only has ${batchCheck.rows[0].quantity}, ${itemSelection.quantities[i]} requested`);
            }
          }
        } else {
          const stockCheck = await client.query(
            `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3 AND quantity > 0`,
            [deliveryData.from_location_id, item.description, item.unit]
          );
          const available = parseFloat(stockCheck.rows[0].total);
          const requested = parseFloat(item.quantity);
          if (available < requested) {
            validationErrors.push(`${item.description} (${item.unit}): ${available === 0 ? 'no stock in warehouse' : `only ${available} available, ${requested} requested`}`);
          }
        }
      }
    }
    if (validationErrors.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot accept delivery:\n${validationErrors.join('\n')}` });
    }

    // Add items to destination inventory
    for (const item of delivery.rows) {
      if (!item.description) continue;

      // === Path A: stock already left the source (reserved or transfer-linked) ===
      if (sourceAlreadyDeducted) {
        // Standalone reserved deliveries carry the exact source-batch breakdown that
        // was consumed at send. Recreate those lots at the destination so cost /
        // selling price / batch / expiry all carry over faithfully.
        let reserved = item.reserved_batches;
        if (typeof reserved === 'string') {
          try { reserved = JSON.parse(reserved); } catch { reserved = null; }
        }

        if (Array.isArray(reserved) && reserved.length > 0) {
          for (const b of reserved) {
            const qty = parseFloat(b.quantity);
            if (!(qty > 0)) continue;
            await client.query(
              `INSERT INTO inventory (
                location_id, description, unit, quantity, unit_cost,
                suggested_selling_price, cost_batch_id, batch_number, expiry_date
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (location_id, description, unit, cost_batch_id)
              DO UPDATE SET
                quantity = inventory.quantity + $4,
                updated_at = CURRENT_TIMESTAMP`,
              [
                deliveryData.to_location_id,
                item.description,
                item.unit,
                qty,
                b.unit_cost,
                b.suggested_selling_price != null ? b.suggested_selling_price : b.unit_cost,
                b.cost_batch_id || `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                b.batch_number || null,
                b.expiry_date || null,
              ]
            );
          }
          continue;
        }

        // Transfer-linked (or a reserved row with no recorded breakdown):
        // add to destination using the source's most recent lot info as a hint.
        const hint = await client.query(
          `SELECT batch_number, expiry_date, suggested_selling_price, cost_batch_id
             FROM inventory
            WHERE location_id = $1 AND description = $2 AND unit = $3
            ORDER BY updated_at DESC
            LIMIT 1`,
          [deliveryData.from_location_id, item.description, item.unit]
        );
        const hintRow = hint.rows[0] || {};
        const costBatchId = hintRow.cost_batch_id || `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        await client.query(
          `INSERT INTO inventory (
            location_id, description, unit, quantity, unit_cost,
            suggested_selling_price, cost_batch_id, batch_number, expiry_date
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (location_id, description, unit, cost_batch_id)
          DO UPDATE SET
            quantity = inventory.quantity + $4,
            updated_at = CURRENT_TIMESTAMP`,
          [
            deliveryData.to_location_id,
            item.description,
            item.unit,
            parseFloat(item.quantity),
            item.unit_cost,
            hintRow.suggested_selling_price || item.unit_cost,
            costBatchId,
            hintRow.batch_number || null,
            hintRow.expiry_date || null,
          ]
        );
        continue;
      }

      // === Path B: standalone delivery — move stock from source to destination ===
      const itemSelection = batch_selections?.find(sel => sel.item_id === item.item_id);

      if (itemSelection && itemSelection.batch_ids && itemSelection.batch_ids.length > 0) {
        // User selected specific batches - use those
        console.log(`[DELIVERY ACCEPT] Using batch selection for ${item.description}`);

        for (let i = 0; i < itemSelection.batch_ids.length; i++) {
          const batchId = itemSelection.batch_ids[i];
          const quantity = parseFloat(itemSelection.quantities[i]);

          if (quantity <= 0) continue;

          // Get batch details from source
          const batchInfo = await client.query(
            `SELECT cost_batch_id, unit_cost, suggested_selling_price, batch_number, expiry_date
             FROM inventory
             WHERE id = $1 AND location_id = $2`,
            [batchId, deliveryData.from_location_id]
          );

          if (batchInfo.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Batch not found for ${item.description}` });
          }

          const batch = batchInfo.rows[0];

          // Deduct from source batch
          await client.query(
            `UPDATE inventory
             SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [quantity, batchId]
          );

          // Add to destination with same batch info
          await client.query(
            `INSERT INTO inventory (
              location_id, description, unit, quantity, unit_cost,
              suggested_selling_price, cost_batch_id, batch_number, expiry_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (location_id, description, unit, cost_batch_id)
            DO UPDATE SET
              quantity = inventory.quantity + $4,
              updated_at = CURRENT_TIMESTAMP`,
            [
              deliveryData.to_location_id,
              item.description,
              item.unit,
              quantity,
              batch.unit_cost,
              batch.suggested_selling_price,
              batch.cost_batch_id,
              batch.batch_number,
              batch.expiry_date
            ]
          );
        }
      } else {
        // No batch selection - use FIFO (existing behavior)
        console.log(`[DELIVERY ACCEPT] Using FIFO for ${item.description}`);

        // Get all batches from source, ordered by FIFO
        const sourceBatches = await client.query(
          `SELECT id, cost_batch_id, quantity, unit_cost, suggested_selling_price,
                  batch_number, expiry_date
           FROM inventory
           WHERE location_id = $1 AND description = $2 AND unit = $3 AND quantity > 0
           ORDER BY
             CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
             expiry_date ASC NULLS LAST,
             created_at ASC`,
          [deliveryData.from_location_id, item.description, item.unit]
        );

        let remainingToTransfer = parseFloat(item.quantity);

        for (const batch of sourceBatches.rows) {
          if (remainingToTransfer <= 0) break;

          const batchQty = parseFloat(batch.quantity);
          const transferQty = Math.min(batchQty, remainingToTransfer);

          // Deduct from source
          await client.query(
            `UPDATE inventory
             SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [transferQty, batch.id]
          );

          // Add to destination
          await client.query(
            `INSERT INTO inventory (
              location_id, description, unit, quantity, unit_cost,
              suggested_selling_price, cost_batch_id, batch_number, expiry_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (location_id, description, unit, cost_batch_id)
            DO UPDATE SET
              quantity = inventory.quantity + $4,
              updated_at = CURRENT_TIMESTAMP`,
            [
              deliveryData.to_location_id,
              item.description,
              item.unit,
              transferQty,
              batch.unit_cost,
              batch.suggested_selling_price,
              batch.cost_batch_id,
              batch.batch_number,
              batch.expiry_date
            ]
          );

          remainingToTransfer -= transferQty;
        }

        if (remainingToTransfer > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Insufficient inventory for ${item.description}. Missing: ${remainingToTransfer}`
          });
        }
      }
    }

    // Update delivery status to delivered
    await client.query(
      `UPDATE deliveries 
       SET status = 'delivered', 
           delivered_date = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    // Update linked transfer status to delivered
    if (deliveryData.transfer_id) {
      await client.query(
        `UPDATE transfers 
         SET status = 'delivered', 
             delivered_by = $1,
             delivered_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [req.user.id, deliveryData.transfer_id]
      );
    }

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_ACCEPT',
      tableName: 'deliveries',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `${req.user.role === 'branch_manager' ? 'Manager' : req.user.role === 'admin' ? 'Admin' : 'Staff'} accepted delivery${batch_selections ? ' with batch selection' : ''} - Items added to inventory and transfer completed`
    });
    
    // Notify warehouse about completed delivery
    await notifyLocation(
      deliveryData.from_location_id,
      'delivery_completed',
      'Delivery Completed',
      `Delivery to branch has been accepted and completed`,
      '/deliveries'
    );
    
    res.json({ message: 'Delivery accepted! Items added to your inventory and transfer completed.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Manager confirms staff delivery acceptance
router.post('/:id/manager-confirm', auth, authorize('branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const delivery = await client.query(
      `SELECT d.*, di.description, di.unit, di.quantity, di.unit_cost
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.id = $1`,
      [id]
    );

    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const deliveryData = delivery.rows[0];

    // Check if manager has access to destination location
    const { hasLocationAccess } = require('../middleware/auth');
    const hasAccess = await hasLocationAccess(req.user.id, req.user.role, deliveryData.to_location_id);
    
    if (!hasAccess) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You do not manage this branch' });
    }

    if (!deliveryData.requires_manager_approval) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This delivery does not require manager confirmation' });
    }

    if (deliveryData.status !== 'pending_manager_confirmation') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Delivery is not pending manager confirmation' });
    }

    // Add items to destination inventory
    for (const item of delivery.rows) {
      if (item.description) {
        await client.query(
          `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, suggested_selling_price, cost_batch_id) 
           VALUES ($1, $2, $3, $4, $5, $5, $6) 
           ON CONFLICT (location_id, description, unit, cost_batch_id) 
           DO UPDATE SET quantity = inventory.quantity + $4, updated_at = CURRENT_TIMESTAMP`,
          [deliveryData.to_location_id, item.description, item.unit, item.quantity, item.unit_cost,
           `DELIVERY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`]
        );
      }
    }

    // Update delivery status to delivered
    await client.query(
      `UPDATE deliveries 
       SET status = 'delivered', 
           delivered_date = CURRENT_TIMESTAMP,
           manager_confirmed_by = $1,
           manager_confirmed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.id, id]
    );

    // Update linked transfer status to delivered
    if (deliveryData.transfer_id) {
      await client.query(
        `UPDATE transfers 
         SET status = 'delivered', 
             delivered_by = $1,
             delivered_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [req.user.id, deliveryData.transfer_id]
      );
    }

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_MANAGER_CONFIRM',
      tableName: 'deliveries',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Manager confirmed staff delivery acceptance - Items added to inventory and transfer completed`
    });
    
    // Notify warehouse about completed delivery
    await notifyLocation(
      deliveryData.from_location_id,
      'delivery_completed',
      'Delivery Completed',
      `Delivery to branch has been confirmed by manager and completed`,
      '/deliveries'
    );
    
    res.json({ message: 'Delivery confirmed by manager! Items added to inventory and transfer completed.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Reject delivery (Admin or Manager)
router.post('/:id/reject', auth, authorize('admin', 'branch_manager'), async (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get delivery details
    const deliveryResult = await client.query(
      `SELECT d.*, 
              from_loc.name as from_location_name,
              to_loc.name as to_location_name
       FROM deliveries d
       LEFT JOIN locations from_loc ON d.from_location_id = from_loc.id
       LEFT JOIN locations to_loc ON d.to_location_id = to_loc.id
       WHERE d.id = $1`,
      [id]
    );
    
    if (deliveryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    const delivery = deliveryResult.rows[0];
    
    // Check permissions
    if (req.user.role === 'branch_manager') {
      // Manager can only reject deliveries to their managed branches
      const managerBranchesRes = await client.query(
        `SELECT location_id FROM manager_branches WHERE user_id = $1
         UNION
         SELECT location_id FROM users WHERE id = $1`,
        [req.user.id]
      );
      const managerLocationIds = managerBranchesRes.rows.map(row => row.location_id);
      
      if (!managerLocationIds.includes(delivery.to_location_id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only reject deliveries to your managed branches' });
      }
    }
    
    // Update delivery status to rejected
    await client.query(
      `UPDATE deliveries
       SET status = 'rejected',
           rejection_reason = $1,
           rejected_by = $2,
           rejected_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [rejection_reason || null, req.user.id, id]
    );

    // Put stock back at the warehouse before finalizing the rejection.
    let stockRestored = false;
    if (delivery.transfer_id) {
      // Transfer-linked: restore via the transfer record.
      const linkedTransferRes = await client.query(
        'SELECT * FROM transfers WHERE id = $1',
        [delivery.transfer_id]
      );
      const linkedTransfer = linkedTransferRes.rows[0];

      if (linkedTransfer && (linkedTransfer.status === 'approved' || linkedTransfer.status === 'in_transit')) {
        await restoreTransferToSource(client, linkedTransfer);
        stockRestored = true;
      }

      await client.query(
        `UPDATE transfers
         SET status = 'rejected',
             rejection_reason = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [rejection_reason || 'Delivery rejected', delivery.transfer_id]
      );
    } else if (delivery.stock_reserved) {
      // Standalone reserved delivery: return each item's reserved breakdown.
      const itemsRes = await client.query(
        'SELECT description, unit, reserved_batches FROM delivery_items WHERE delivery_id = $1',
        [id]
      );
      for (const item of itemsRes.rows) {
        await restoreReservedToSource(
          client, delivery.from_location_id, item.description, item.unit, item.reserved_batches
        );
      }
      // Clear the flag so the stock is never returned twice (e.g. if later deleted).
      await client.query('UPDATE deliveries SET stock_reserved = false WHERE id = $1', [id]);
      stockRestored = true;
    }

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_REJECT',
      tableName: 'deliveries',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Rejected delivery from ${delivery.from_location_name} to ${delivery.to_location_name}. Reason: ${rejection_reason || 'No reason provided'}${stockRestored ? ' - Inventory restored to source' : ''}`
    });

    // Notify relevant parties
    await notifyLocation(
      delivery.from_location_id,
      'delivery_rejected',
      'Delivery Rejected',
      `Delivery to ${delivery.to_location_name} was rejected${stockRestored ? ' and stock returned to source' : ''}. Reason: ${rejection_reason || 'No reason provided'}`,
      '/deliveries'
    );

    res.json({
      message: stockRestored
        ? 'Delivery rejected. Inventory was restored to the source location.'
        : 'Delivery rejected successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error rejecting delivery:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
