const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');
const { notifyAdmins } = require('./notifications');

// Get all sales transactions
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    let query = `
      SELECT st.*,
             l.name as location_name, l.type as location_type,
             cb.full_name as cancelled_by_name,
             rb.full_name as cancel_reviewed_by_name
      FROM sales_transactions st
      JOIN locations l ON st.location_id = l.id
      LEFT JOIN users cb ON st.cancelled_by = cb.id
      LEFT JOIN users rb ON st.cancel_reviewed_by = rb.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    // Branch staff/manager: hide sales that are pending or approved for cancellation
    if (req.user.role === 'branch_manager' || req.user.role === 'branch_staff') {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
      query += ` AND (st.cancellation_status IS NULL OR st.cancellation_status = 'rejected')`;
    } else if (req.user.role !== 'admin' && req.user.location_id) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (locationId) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(locationId);
      paramCount++;
    }

    // Filter by date range
    if (startDate) {
      query += ` AND st.transaction_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND st.transaction_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += ' ORDER BY st.transaction_date DESC, st.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending cancellation requests (admin only)
router.get('/pending-cancellations', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT st.*,
              l.name as location_name, l.type as location_type,
              cb.full_name as cancelled_by_name
       FROM sales_transactions st
       JOIN locations l ON st.location_id = l.id
       LEFT JOIN users cb ON st.cancelled_by = cb.id
       WHERE st.cancellation_status = 'pending'
       ORDER BY st.cancelled_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record a new sale
router.post('/', auth, authorize('admin', 'warehouse', 'branch_manager', 'branch_staff'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      transaction_date, location_id, item_description, item_unit,
      quantity_sold, unit_price, payment_method, customer_name, notes,
      discount_type, custom_discount_percent, discount_reason
    } = req.body;
    
    // Validate location access
    if (req.user.role !== 'admin' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'You can only record sales for your assigned location' });
    }
    
    await client.query('BEGIN');
    
    // Calculate discount using proper Philippine formula
    let discount_percent = 0;
    let final_discount_reason = '';
    let discount_amount = 0;
    let total_amount = 0;
    
    const grossAmount = parseFloat(quantity_sold) * parseFloat(unit_price);
    
    if (discount_type === 'pwd') {
      discount_percent = 20;
      final_discount_reason = discount_reason || 'PWD Discount';
      
      // Philippine PWD Formula:
      // 1. Remove VAT: Price / 1.12
      const netOfVat = grossAmount / 1.12;
      // 2. Calculate 20% discount on net of VAT
      discount_amount = netOfVat * 0.20;
      // 3. Subtract discount from original price and round off
      total_amount = Math.round(grossAmount - discount_amount);
      
    } else if (discount_type === 'senior') {
      discount_percent = 20;
      final_discount_reason = discount_reason || 'Senior Citizen Discount';
      
      // Philippine Senior Citizen Formula:
      // 1. Remove VAT: Price / 1.12
      const netOfVat = grossAmount / 1.12;
      // 2. Calculate 20% discount on net of VAT
      discount_amount = netOfVat * 0.20;
      // 3. Subtract discount from original price and round off
      total_amount = Math.round(grossAmount - discount_amount);
      
    } else if (discount_type === 'custom' && custom_discount_percent) {
      discount_percent = parseFloat(custom_discount_percent);
      final_discount_reason = discount_reason || 'Custom Discount';
      
      // Custom discount: simple percentage off and round off
      discount_amount = grossAmount * (discount_percent / 100);
      total_amount = Math.round(grossAmount - discount_amount);
      
    } else {
      // No discount
      total_amount = grossAmount;
    }
    
    // Insert sales transaction
    const saleResult = await client.query(
      `INSERT INTO sales_transactions (
        transaction_date, location_id, item_description, item_unit,
        quantity_sold, unit_price, discount_percent, discount_amount,
        discount_reason, total_amount, payment_method,
        sold_by, sold_by_name, customer_name, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        transaction_date || new Date().toISOString().split('T')[0],
        location_id, item_description, item_unit, quantity_sold, unit_price,
        discount_percent, discount_amount, final_discount_reason || null,
        total_amount, payment_method, req.user.id,
        req.user.full_name || req.user.username, customer_name, notes
      ]
    );
    
    // Deduct from inventory using FIFO (First In First Out)
    // Get all batches for this item ordered by creation date (oldest first)
    const batchesResult = await client.query(
      `SELECT * FROM inventory 
       WHERE location_id = $1 AND description = $2 AND unit = $3 AND quantity > 0
       ORDER BY created_at ASC`,
      [location_id, item_description, item_unit]
    );
    
    if (batchesResult.rows.length === 0) {
      throw new Error('Item not found in inventory or out of stock');
    }
    
    // Calculate total available quantity across all batches
    const totalAvailable = batchesResult.rows.reduce((sum, batch) => sum + parseFloat(batch.quantity), 0);
    
    if (totalAvailable < parseFloat(quantity_sold)) {
      throw new Error(`Insufficient inventory. Available: ${totalAvailable}, Requested: ${quantity_sold}`);
    }
    
    // Deduct from batches using FIFO (oldest batches first)
    let remainingToDeduct = parseFloat(quantity_sold);
    const updatedBatches = [];
    
    console.log(`📦 FIFO Sale: Deducting ${quantity_sold} ${item_unit} of ${item_description}`);
    
    for (const batch of batchesResult.rows) {
      if (remainingToDeduct <= 0) break;
      
      const batchQty = parseFloat(batch.quantity);
      const deductFromThisBatch = Math.min(batchQty, remainingToDeduct);
      
      console.log(`  - Batch ${batch.batch_number}: Deducting ${deductFromThisBatch} (had ${batchQty}, will have ${batchQty - deductFromThisBatch})`);
      
      const updateResult = await client.query(
        `UPDATE inventory 
         SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [deductFromThisBatch, batch.id]
      );
      
      updatedBatches.push({
        batch_number: batch.batch_number,
        deducted: deductFromThisBatch,
        remaining: updateResult.rows[0].quantity
      });
      
      remainingToDeduct -= deductFromThisBatch;
    }
    
    console.log(`✅ FIFO Sale Complete: Deducted from ${updatedBatches.length} batch(es)`);
    
    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_RECORDED',
      tableName: 'sales_transactions',
      recordId: saleResult.rows[0].id,
      newValues: saleResult.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Sold ${quantity_sold} ${item_unit} of ${item_description}${discount_percent > 0 ? ` with ${discount_percent}% discount` : ''} (FIFO: ${updatedBatches.length} batches)`
    });
    
    res.status(201).json({
      sale: saleResult.rows[0],
      batches_used: updatedBatches
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Delete a sale transaction (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');
    
    // Get sale details
    const saleResult = await client.query('SELECT * FROM sales_transactions WHERE id = $1', [id]);
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    const sale = saleResult.rows[0];
    
    // Restore inventory
    await client.query(
      `UPDATE inventory 
       SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
       WHERE location_id = $2 AND description = $3 AND unit = $4`,
      [sale.quantity_sold, sale.location_id, sale.item_description, sale.item_unit]
    );
    
    // Delete sale
    await client.query('DELETE FROM sales_transactions WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_DELETED',
      tableName: 'sales_transactions',
      recordId: id,
      oldValues: sale,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted sale and restored ${sale.quantity_sold} ${sale.item_unit} of ${sale.item_description} to inventory`
    });
    
    res.json({ message: 'Sale deleted and inventory restored' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Update a sale transaction (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const {
      transaction_date, quantity_sold, unit_price,
      payment_method, customer_name, notes
    } = req.body;
    
    await client.query('BEGIN');
    
    // Get old sale details
    const oldSaleResult = await client.query('SELECT * FROM sales_transactions WHERE id = $1', [id]);
    
    if (oldSaleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    const oldSale = oldSaleResult.rows[0];
    
    // Calculate quantity difference
    const oldQty = parseFloat(oldSale.quantity_sold);
    const newQty = parseFloat(quantity_sold);
    const qtyDifference = newQty - oldQty;
    
    // Update inventory if quantity changed
    if (qtyDifference !== 0) {
      const inventoryResult = await client.query(
        `UPDATE inventory 
         SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE location_id = $2 AND description = $3 AND unit = $4
         RETURNING *`,
        [qtyDifference, oldSale.location_id, oldSale.item_description, oldSale.item_unit]
      );
      
      if (inventoryResult.rows.length === 0) {
        throw new Error('Item not found in inventory');
      }
      
      if (parseFloat(inventoryResult.rows[0].quantity) < 0) {
        throw new Error('Insufficient inventory. Cannot increase sale quantity beyond available stock.');
      }
    }
    
    // Calculate new total
    const total_amount = parseFloat(quantity_sold) * parseFloat(unit_price);
    
    // Update sale transaction
    const updatedSaleResult = await client.query(
      `UPDATE sales_transactions 
       SET transaction_date = $1, quantity_sold = $2, unit_price = $3,
           total_amount = $4, payment_method = $5, customer_name = $6,
           notes = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [transaction_date, quantity_sold, unit_price, total_amount, payment_method, customer_name, notes, id]
    );
    
    await client.query('COMMIT');
    
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_UPDATED',
      tableName: 'sales_transactions',
      recordId: id,
      oldValues: oldSale,
      newValues: updatedSaleResult.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated sale: ${oldSale.item_description} (qty: ${oldQty} → ${newQty})`
    });
    
    res.json(updatedSaleResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ── POST /:id/cancel ─────────────────────────────────────────────────────────
// Branch staff/manager requests cancellation of a wrong sale
// Inventory is restored IMMEDIATELY — no need to wait for admin
router.post('/:id/cancel', auth, authorize('admin', 'branch_manager', 'branch_staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ error: 'A reason is required to cancel a sale' });
    }

    await client.query('BEGIN');

    const saleResult = await client.query(
      'SELECT * FROM sales_transactions WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult.rows[0];

    // Only allow cancellation of own branch sales (non-admin)
    if (req.user.role !== 'admin' && sale.location_id !== req.user.location_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only cancel sales from your own branch' });
    }

    if (sale.cancellation_status === 'pending' || sale.cancellation_status === 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This sale has already been cancelled' });
    }

    // ── Restore inventory immediately (FIFO reverse — add back to latest batch or create new) ──
    const batchResult = await client.query(
      `SELECT * FROM inventory
       WHERE location_id = $1 AND description = $2 AND unit = $3
       ORDER BY created_at DESC LIMIT 1`,
      [sale.location_id, sale.item_description, sale.item_unit]
    );

    if (batchResult.rows.length > 0) {
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [sale.quantity_sold, batchResult.rows[0].id]
      );
    } else {
      // Item was fully consumed — create a new inventory row
      await client.query(
        `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, cost_batch_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          sale.location_id, sale.item_description, sale.item_unit,
          sale.quantity_sold, sale.unit_cost || 0,
          `CANCEL-${sale.id}-${Date.now()}`
        ]
      );
    }

    // Mark sale as cancellation pending
    await client.query(
      `UPDATE sales_transactions
       SET cancellation_status  = 'pending',
           cancelled_by          = $1,
           cancelled_at          = CURRENT_TIMESTAMP,
           cancellation_reason   = $2,
           updated_at            = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, reason.trim(), id]
    );

    await client.query('COMMIT');

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_CANCEL_REQUEST',
      tableName: 'sales_transactions',
      recordId: id,
      oldValues: sale,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Cancellation requested for sale of ${sale.quantity_sold} ${sale.item_unit} of ${sale.item_description}. Inventory restored immediately. Reason: ${reason}`
    });

    // Notify admins
    await notifyAdmins(
      'sale_cancel_request',
      'Sale Cancellation Request',
      `${req.user.full_name || req.user.username} requested cancellation of a sale: ${sale.quantity_sold} ${sale.item_unit} of ${sale.item_description}. Inventory already restored.`,
      '/sales'
    );

    res.json({ message: 'Sale cancelled and inventory restored. Awaiting admin acknowledgement.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ── PUT /:id/cancel/approve ───────────────────────────────────────────────────
// Admin acknowledges/approves the cancellation (inventory was already restored)
router.put('/:id/cancel/approve', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_note } = req.body;

    const saleResult = await pool.query(
      'SELECT * FROM sales_transactions WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult.rows[0];

    if (sale.cancellation_status !== 'pending') {
      return res.status(400).json({ error: 'No pending cancellation for this sale' });
    }

    await pool.query(
      `UPDATE sales_transactions
       SET cancellation_status  = 'approved',
           cancel_reviewed_by   = $1,
           cancel_reviewed_at   = CURRENT_TIMESTAMP,
           cancel_admin_note    = $2,
           updated_at           = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, admin_note?.trim() || null, id]
    );

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_CANCEL_APPROVED',
      tableName: 'sales_transactions',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Approved cancellation of sale: ${sale.item_description} (${sale.quantity_sold} ${sale.item_unit})`
    });

    res.json({ message: 'Cancellation approved.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id/cancel/reject ───────────────────────────────────────────────────
// Admin rejects the cancellation — re-deducts inventory, sale becomes active again
router.put('/:id/cancel/reject', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { admin_note } = req.body;

    if (!admin_note?.trim()) {
      return res.status(400).json({ error: 'A reason is required to reject the cancellation' });
    }

    await client.query('BEGIN');

    const saleResult = await client.query(
      'SELECT * FROM sales_transactions WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult.rows[0];

    if (sale.cancellation_status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No pending cancellation for this sale' });
    }

    // Re-deduct inventory (cancel the cancel)
    const batchResult = await client.query(
      `SELECT * FROM inventory
       WHERE location_id = $1 AND description = $2 AND unit = $3
       ORDER BY created_at DESC LIMIT 1`,
      [sale.location_id, sale.item_description, sale.item_unit]
    );

    if (batchResult.rows.length > 0) {
      const available = parseFloat(batchResult.rows[0].quantity);
      if (available < parseFloat(sale.quantity_sold)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Cannot reject: only ${available} ${sale.item_unit} available in inventory but ${sale.quantity_sold} need to be re-deducted.`
        });
      }
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [sale.quantity_sold, batchResult.rows[0].id]
      );
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot reject: item no longer in inventory.' });
    }

    // Clear cancellation — sale becomes active again
    await client.query(
      `UPDATE sales_transactions
       SET cancellation_status  = 'rejected',
           cancel_reviewed_by   = $1,
           cancel_reviewed_at   = CURRENT_TIMESTAMP,
           cancel_admin_note    = $2,
           updated_at           = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, admin_note.trim(), id]
    );

    await client.query('COMMIT');

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_CANCEL_REJECTED',
      tableName: 'sales_transactions',
      recordId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Rejected cancellation of sale: ${sale.item_description} (${sale.quantity_sold} ${sale.item_unit}). Inventory re-deducted. Reason: ${admin_note}`
    });

    res.json({ message: 'Cancellation rejected. Sale is active again and inventory re-deducted.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get sales summary
router.get('/summary', auth, async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;
    
    let query = `
      SELECT 
        location_id,
        l.name as location_name,
        COUNT(*) as total_transactions,
        SUM(quantity_sold) as total_items_sold,
        SUM(total_amount) as total_revenue
      FROM sales_transactions st
      JOIN locations l ON st.location_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (locationId) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(locationId);
      paramCount++;
    }
    
    if (startDate) {
      query += ` AND st.transaction_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      query += ` AND st.transaction_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    query += ' GROUP BY location_id, l.name ORDER BY l.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
