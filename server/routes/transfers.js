const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { notifyAdmins, notifyLocation } = require('./notifications');
const { logAudit } = require('../middleware/auditLog');

// Create transfer request (branch manager requests, warehouse/admin creates)
router.post('/', auth, authorize('admin', 'warehouse', 'branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { from_location_id, to_location_id, description, unit, quantity, unit_cost, notes, skip_notification } = req.body;
    
    // Check if user has access to from_location (for warehouse/admin creating transfers)
    if (req.user.role === 'warehouse' && req.user.location_id != from_location_id) {
      return res.status(403).json({ error: 'Access denied to source location' });
    }

    // Branch managers can create transfers FROM their branch OR request TO their branch from warehouse
    if (req.user.role === 'branch_manager') {
      const isRequestingFromWarehouse = to_location_id == req.user.location_id;
      const isTransferringFromOwnBranch = from_location_id == req.user.location_id;
      
      if (!isRequestingFromWarehouse && !isTransferringFromOwnBranch) {
        return res.status(403).json({ error: 'You can only create transfers from your own branch or request items to your branch' });
      }
    }

    await client.query('BEGIN');

    // Get source and destination location types
    const locations = await client.query(
      'SELECT id, type FROM locations WHERE id IN ($1, $2)',
      [from_location_id, to_location_id]
    );

    const fromLocation = locations.rows.find(l => l.id == from_location_id);
    const toLocation = locations.rows.find(l => l.id == to_location_id);

    if (!fromLocation || !toLocation) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Source or destination location not found' });
    }

    // Check if this is a branch-to-branch transfer
    const isBranchToBranch = fromLocation.type === 'branch' && toLocation.type === 'branch';

    // Get inventory from source location to validate (skip for branch manager requests to warehouse)
    const isBranchManagerRequest = req.user.role === 'branch_manager' && to_location_id == req.user.location_id;
    
    if (!isBranchManagerRequest) {
      // Get all cost batches for this item
      const sourceInventory = await client.query(
        'SELECT * FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
        [from_location_id, description, unit]
      );

      if (sourceInventory.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found in source location inventory' });
      }

      // Calculate total available quantity across all cost batches
      const totalAvailable = sourceInventory.rows.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0);
      const requestedQty = parseFloat(quantity);

      if (totalAvailable < requestedQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient quantity. Available: ${totalAvailable}, Requested: ${requestedQty}` 
        });
      }
    }

    // Determine initial status - ALL transfers need admin approval
    let status = 'pending';
    let approved_by = null;
    let approved_at = null;
    let requires_admin_approval = true; // All transfers require admin approval

    // Record transfer request (inventory NOT deducted yet)
    const transfer = await client.query(
      `INSERT INTO transfers (
        from_location_id, to_location_id, description, unit, quantity, unit_cost, 
        transferred_by, notes, status, approved_by, approved_at, requires_admin_approval
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
      RETURNING *`,
      [from_location_id, to_location_id, description, unit, quantity, unit_cost, 
       req.user.id, notes, status, approved_by, approved_at, requires_admin_approval]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_CREATE',
      tableName: 'transfers',
      recordId: transfer.rows[0].id,
      newValues: transfer.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Created transfer request: ${quantity} ${unit} of ${description}`
    });
    
    // Notify admins about new transfer request (skip if part of multi-item batch)
    if (!skip_notification) {
      const locationInfo = await client.query(
        'SELECT name FROM locations WHERE id = $1',
        [to_location_id]
      );
      await notifyAdmins(
        'transfer_pending',
        'New Transfer Request',
        `Transfer request to ${locationInfo.rows[0]?.name || 'location'} needs approval`,
        '/transfers'
      );
    }
    
    // All transfers need admin approval
    const message = 'Transfer request created. Waiting for admin approval.';
    
    res.status(201).json({ ...transfer.rows[0], message });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Batch notification for multi-item transfers
router.post('/batch-notify', auth, async (req, res) => {
  try {
    const { transfer_ids, item_count, to_location_id } = req.body;
    
    // Get location name
    const locationInfo = await pool.query(
      'SELECT name FROM locations WHERE id = $1',
      [to_location_id]
    );
    
    // Send ONE notification for the batch
    await notifyAdmins(
      'transfer_pending',
      'New Transfer Request',
      `Transfer request with ${item_count} item(s) to ${locationInfo.rows[0]?.name || 'location'} needs approval`,
      '/transfers'
    );
    
    res.json({ message: 'Batch notification sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clean all transfer history (admin only)
router.delete('/clean-history', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Delete in correct order due to foreign key constraints
    // 1. Delete deliveries first (references transfers)
    const deliveriesResult = await client.query('DELETE FROM deliveries');
    
    // 2. Delete transfer_items (has CASCADE, but explicit for clarity)
    const itemsResult = await client.query('DELETE FROM transfer_items');
    
    // 3. Delete transfers
    const transfersResult = await client.query('DELETE FROM transfers');
    
    await client.query('COMMIT');
    res.json({ 
      message: `Deleted ${transfersResult.rowCount} transfers, ${itemsResult.rowCount} transfer items, and ${deliveriesResult.rowCount} deliveries`, 
      transfers: transfersResult.rowCount,
      items: itemsResult.rowCount,
      deliveries: deliveriesResult.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cleaning transfer history:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Approve transfer (admin only)
router.post('/:id/approve', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Get transfer details
    const transfer = await client.query(
      'SELECT * FROM transfers WHERE id = $1',
      [id]
    );

    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transferData = transfer.rows[0];

    if (transferData.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Transfer is already ${transferData.status}` });
    }



    // Validate inventory still available
    const inventory = await client.query(
      'SELECT quantity FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
      [transferData.from_location_id, transferData.description, transferData.unit]
    );

    // Convert to numbers for comparison
    const availableQty = parseFloat(inventory.rows[0]?.quantity || 0);
    const requiredQty = parseFloat(transferData.quantity);

    if (inventory.rows.length === 0 || availableQty < requiredQty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient inventory to approve this transfer. Available: ${availableQty}, Required: ${requiredQty}` 
      });
    }

    // Update transfer to approved
    const result = await client.query(
      `UPDATE transfers 
       SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 
       RETURNING *`,
      [req.user.id, id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_APPROVE',
      tableName: 'transfers',
      recordId: id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Approved transfer: ${transferData.description} (${transferData.quantity} ${transferData.unit})`
    });
    
    // Notify requester about approval
    await notifyLocation(
      transferData.from_location_id,
      'transfer_approved',
      'Transfer Approved',
      `Your transfer request has been approved and is ready to ship`,
      '/transfers'
    );
    
    // Notify destination branch that transfer is approved and will arrive soon
    await notifyLocation(
      transferData.to_location_id,
      'transfer_incoming',
      'Transfer Approved - Arriving Soon',
      `A transfer from ${transferData.from_location_name || 'warehouse'} has been approved and will be arriving soon`,
      '/transfers'
    );
    
    const message = 'Transfer approved. Ready to ship.';
    
    res.json({ ...result.rows[0], message });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Reject transfer (admin only)
router.post('/:id/reject', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    await client.query('BEGIN');

    const transfer = await client.query(
      'SELECT * FROM transfers WHERE id = $1',
      [id]
    );

    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transferData = transfer.rows[0];

    if (transferData.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Transfer is already ${transferData.status}` });
    }

    const result = await client.query(
      `UPDATE transfers 
       SET status = 'rejected', rejection_reason = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 
       RETURNING *`,
      [rejection_reason || null, id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_REJECT',
      tableName: 'transfers',
      recordId: id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Rejected transfer: ${transferData.description} - ${rejection_reason || 'No reason provided'}`
    });
    
    // Notify requester about rejection
    await notifyLocation(
      transferData.from_location_id,
      'transfer_rejected',
      'Transfer Rejected',
      rejection_reason ? `Transfer rejected: ${rejection_reason}` : 'Your transfer request has been rejected',
      '/transfers'
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Ship transfer (warehouse/admin marks as in_transit - DEDUCTS inventory and creates delivery)
router.post('/:id/ship', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const transfer = await client.query(
      'SELECT * FROM transfers WHERE id = $1',
      [id]
    );

    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transferData = transfer.rows[0];

    if (transferData.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfer must be approved before shipping' });
    }

    // Check inventory availability
    const inventory = await client.query(
      'SELECT quantity FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
      [transferData.from_location_id, transferData.description, transferData.unit]
    );

    // Convert to numbers for comparison
    const availableQty = parseFloat(inventory.rows[0]?.quantity || 0);
    const requiredQty = parseFloat(transferData.quantity);

    if (inventory.rows.length === 0 || availableQty < requiredQty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient inventory. Available: ${availableQty}, Required: ${requiredQty}` 
      });
    }

    // DEDUCT from source inventory
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE location_id = $2 AND description = $3 AND unit = $4',
      [transferData.quantity, transferData.from_location_id, transferData.description, transferData.unit]
    );

    // Create delivery record
    const delivery = await client.query(
      `INSERT INTO deliveries (
        transfer_id, 
        from_location_id, 
        to_location_id, 
        status,
        unit_cost,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        id,
        transferData.from_location_id,
        transferData.to_location_id,
        'in_transit',
        transferData.unit_cost,
        req.user.id
      ]
    );

    // Create delivery item
    await client.query(
      `INSERT INTO delivery_items (
        delivery_id,
        description,
        unit,
        quantity,
        unit_cost
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        delivery.rows[0].id,
        transferData.description,
        transferData.unit,
        transferData.quantity,
        transferData.unit_cost
      ]
    );

    // Update transfer status to in_transit
    const result = await client.query(
      `UPDATE transfers 
       SET status = 'in_transit', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_SHIP',
      tableName: 'transfers',
      recordId: id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Shipped transfer: ${transferData.description} (${transferData.quantity} ${transferData.unit}) - Inventory deducted, delivery created`
    });
    
    // Get location names for notification
    const locationInfo = await client.query(
      'SELECT name FROM locations WHERE id = $1',
      [transferData.to_location_id]
    );
    
    // Notify destination branch that items are being delivered
    await notifyLocation(
      transferData.to_location_id,
      'transfer_shipped',
      'Transfer Shipped - On The Way',
      `Your transfer is now being delivered. Please confirm receipt when it arrives.`,
      '/transfers'
    );
    
    res.json({ 
      ...result.rows[0], 
      message: 'Transfer shipped! Inventory deducted. Branch has been notified.' 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Confirm delivery (branch manager confirms arrival - ADDS inventory)
// NOTE: This is now handled through the Deliveries page acceptance flow
router.post('/:id/deliver', auth, authorize('admin', 'branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const transfer = await client.query(
      'SELECT * FROM transfers WHERE id = $1',
      [id]
    );

    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transferData = transfer.rows[0];

    if (transferData.status !== 'in_transit') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfer must be in transit before delivery confirmation' });
    }

    // Check if user has access to destination location
    if (req.user.role === 'branch_manager' && req.user.location_id != transferData.to_location_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to destination location' });
    }

    // Get the source inventory item to copy batch_number and expiry_date
    const sourceInventory = await client.query(
      'SELECT batch_number, expiry_date FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
      [transferData.from_location_id, transferData.description, transferData.unit]
    );

    const batchNumber = sourceInventory.rows[0]?.batch_number || null;
    const expiryDate = sourceInventory.rows[0]?.expiry_date || null;

    // ADD to destination inventory with batch_number and expiry_date
    await client.query(
      `INSERT INTO inventory 
       (location_id, description, unit, quantity, unit_cost, suggested_selling_price, 
        batch_number, expiry_date, max_quantity, cost_batch_id, is_new_item, is_new_cost) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $4, $9, false, false) 
       ON CONFLICT (location_id, description, unit, cost_batch_id) 
       DO UPDATE SET 
         quantity = inventory.quantity + $4, 
         batch_number = COALESCE($7, inventory.batch_number),
         expiry_date = COALESCE($8, inventory.expiry_date),
         updated_at = CURRENT_TIMESTAMP`,
      [
        transferData.to_location_id, 
        transferData.description, 
        transferData.unit, 
        transferData.quantity, 
        transferData.unit_cost, 
        transferData.unit_cost, // suggested_selling_price same as unit_cost for transfers
        batchNumber, 
        expiryDate,
        `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` // cost_batch_id
      ]
    );

    // Update transfer status to delivered (completed)
    const result = await client.query(
      `UPDATE transfers 
       SET status = 'delivered', delivered_by = $1, delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 
       RETURNING *`,
      [req.user.id, id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_DELIVER',
      tableName: 'transfers',
      recordId: id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Delivered transfer: ${transferData.description} (${transferData.quantity} ${transferData.unit}) - Inventory added`
    });
    
    // Notify source location (warehouse) that transfer is complete
    await notifyLocation(
      transferData.from_location_id,
      'transfer_completed',
      'Transfer Completed',
      `Transfer to ${transferData.to_location_name || 'branch'} has been received and completed`,
      '/transfers'
    );
    
    res.json({ 
      ...result.rows[0], 
      message: 'Transfer received! Inventory added to your location.' 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Cancel transfer (only if pending or approved, not shipped)
router.post('/:id/cancel', auth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const transfer = await client.query(
      'SELECT * FROM transfers WHERE id = $1',
      [id]
    );

    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transferData = transfer.rows[0];

    // Only admin can cancel
    if (req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only admin can cancel transfers' });
    }

    // Admin can cancel any status except already cancelled or rejected
    if (transferData.status === 'cancelled' || transferData.status === 'rejected') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfer is already cancelled or rejected' });
    }

    const result = await client.query(
      `UPDATE transfers 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_CANCEL',
      tableName: 'transfers',
      recordId: id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Cancelled transfer: ${transferData.description} (${transferData.quantity} ${transferData.unit})`
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Delete transfer (admin only - for cancelled transfers)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const transfer = await client.query(
      'SELECT * FROM transfers WHERE id = $1',
      [id]
    );

    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transferData = transfer.rows[0];

    // Only allow deletion of cancelled or rejected transfers
    if (transferData.status !== 'cancelled' && transferData.status !== 'rejected') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only delete cancelled or rejected transfers' });
    }

    // Delete related deliveries first (if any)
    await client.query('DELETE FROM deliveries WHERE transfer_id = $1', [id]);

    // Delete transfer_items (if any)
    await client.query('DELETE FROM transfer_items WHERE transfer_id = $1', [id]);

    // Delete the transfer
    await client.query('DELETE FROM transfers WHERE id = $1', [id]);

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_DELETE',
      tableName: 'transfers',
      recordId: id,
      oldValues: transferData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted ${transferData.status} transfer: ${transferData.description} (${transferData.quantity} ${transferData.unit})`
    });
    
    res.json({ message: 'Transfer deleted successfully', id: parseInt(id) });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Undo cancel - restore cancelled transfer to in_transit (admin only)
router.post('/:id/undo-cancel', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const transfer = await client.query(
      'SELECT * FROM transfers WHERE id = $1',
      [id]
    );

    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transferData = transfer.rows[0];

    // Only allow undo for cancelled transfers
    if (transferData.status !== 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only undo cancelled transfers' });
    }

    // Restore to in_transit status (the status before cancel)
    const result = await client.query(
      `UPDATE transfers 
       SET status = 'in_transit', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_UNDO_CANCEL',
      tableName: 'transfers',
      recordId: id,
      oldValues: { status: 'cancelled' },
      newValues: { status: 'in_transit' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Restored cancelled transfer to in_transit: ${transferData.description} (${transferData.quantity} ${transferData.unit})`
    });
    
    res.json({ 
      ...result.rows[0], 
      message: 'Transfer restored to In Transit status' 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get transfer history
router.get('/', auth, async (req, res) => {
  try {
    const { from_location_id, to_location_id, status, start_date, end_date } = req.query;
    
    let query = `
      SELECT t.*, 
             fl.name as from_location_name, 
             tl.name as to_location_name,
             u.full_name as transferred_by_name,
             au.full_name as approved_by_name,
             du.full_name as delivered_by_name
      FROM transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users u ON t.transferred_by = u.id
      LEFT JOIN users au ON t.approved_by = au.id
      LEFT JOIN users du ON t.delivered_by = du.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filter by user role and location
    if (req.user.role === 'branch_manager') {
      query += ` AND (t.from_location_id = $${paramCount} OR t.to_location_id = $${paramCount})`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (req.user.role === 'warehouse') {
      query += ` AND t.from_location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    }

    if (from_location_id) {
      query += ` AND t.from_location_id = $${paramCount}`;
      params.push(from_location_id);
      paramCount++;
    }

    if (to_location_id) {
      query += ` AND t.to_location_id = $${paramCount}`;
      params.push(to_location_id);
      paramCount++;
    }

    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (start_date) {
      query += ` AND t.transfer_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND t.transfer_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ' ORDER BY t.transfer_date DESC, t.created_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transfer items for a specific transfer (for batch transfers)
router.get('/:id/items', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get transfer items
    const result = await pool.query(
      `SELECT ti.*, t.status, t.from_location_id, t.to_location_id,
              fl.name as from_location_name,
              tl.name as to_location_name
       FROM transfer_items ti
       JOIN transfers t ON ti.transfer_id = t.id
       LEFT JOIN locations fl ON t.from_location_id = fl.id
       LEFT JOIN locations tl ON t.to_location_id = tl.id
       WHERE ti.transfer_id = $1
       ORDER BY ti.id`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No items found for this transfer' });
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transfer items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending transfers (for approval - admin only)
router.get('/pending', auth, authorize('admin'), async (req, res) => {
  try {
    let query = `
      SELECT t.*, 
             fl.name as from_location_name, 
             tl.name as to_location_name,
             u.full_name as transferred_by_name
      FROM transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users u ON t.transferred_by = u.id
      WHERE t.status = 'pending'
    `;
    
    query += ' ORDER BY t.created_at ASC';
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending transfers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch transfer creation (for CDR imports) - Admin only
router.post('/batch', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { transfers } = req.body; // Array of transfer objects
    
    if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
      return res.status(400).json({ error: 'Transfers array is required' });
    }

    await client.query('BEGIN');

    const results = [];
    const errors = [];

    for (const transferData of transfers) {
      try {
        const { from_location_id, to_location_id, notes, items } = transferData;

        // Validate locations
        const locations = await client.query(
          'SELECT id, name, type FROM locations WHERE id IN ($1, $2)',
          [from_location_id, to_location_id]
        );

        if (locations.rows.length !== 2) {
          errors.push(`Invalid locations for transfer`);
          continue;
        }

        const fromLocation = locations.rows.find(l => l.id == from_location_id);
        const toLocation = locations.rows.find(l => l.id == to_location_id);

        // Create transfer record with summary information
        const firstItem = items[0]; // Use first item for summary
        const totalQuantity = items.reduce((sum, item) => sum + parseFloat(item.quantity), 0);
        const transferResult = await client.query(
          `INSERT INTO transfers 
           (from_location_id, to_location_id, description, unit, quantity, unit_cost, 
            notes, status, transferred_by, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, CURRENT_TIMESTAMP) 
           RETURNING *`,
          [
            from_location_id, 
            to_location_id, 
            `Batch Transfer: ${items.length} items`, // Summary description
            'BATCH', // Summary unit
            totalQuantity, // Total quantity
            0, // Average or summary unit cost (will be detailed in transfer_items)
            notes, 
            req.user.id
          ]
        );

        const transfer = transferResult.rows[0];

        // Process each item in the transfer
        for (const item of items) {
          const { inventory_item_id, quantity, description, unit, unit_cost } = item;

          // Get inventory item details
          const inventoryResult = await client.query(
            'SELECT * FROM inventory WHERE id = $1 AND location_id = $2',
            [inventory_item_id, from_location_id]
          );

          if (inventoryResult.rows.length === 0) {
            errors.push(`Item not found in source location: ${description}`);
            continue;
          }

          const inventoryItem = inventoryResult.rows[0];

          // Check sufficient quantity
          if (parseFloat(inventoryItem.quantity) < parseFloat(quantity)) {
            errors.push(`Insufficient quantity for ${description}. Available: ${inventoryItem.quantity}, Requested: ${quantity}`);
            continue;
          }

          // Create transfer item record
          await client.query(
            `INSERT INTO transfer_items 
             (transfer_id, description, unit, quantity, unit_cost) 
             VALUES ($1, $2, $3, $4, $5)`,
            [transfer.id, description, unit, quantity, unit_cost]
          );

          // Reduce quantity from source location
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [quantity, inventory_item_id]
          );

          // Add to destination location (check if item exists)
          const destInventory = await client.query(
            `SELECT * FROM inventory 
             WHERE location_id = $1 AND description = $2 AND unit = $3 
             AND unit_cost = $4 AND COALESCE(batch_number, '') = COALESCE($5, '')`,
            [to_location_id, description, unit, unit_cost, inventoryItem.batch_number]
          );

          if (destInventory.rows.length > 0) {
            // Update existing inventory
            await client.query(
              'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              [quantity, destInventory.rows[0].id]
            );
          } else {
            // Create new inventory record
            await client.query(
              `INSERT INTO inventory 
               (location_id, description, unit, quantity, unit_cost, suggested_selling_price, 
                batch_number, expiry_date, max_quantity, cost_batch_id, is_new_item, is_new_cost) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $4, $9, false, false)`,
              [to_location_id, description, unit, quantity, unit_cost, 
               inventoryItem.suggested_selling_price, inventoryItem.batch_number, 
               inventoryItem.expiry_date, inventoryItem.cost_batch_id]
            );
          }
        }

        // Mark transfer as delivered
        await client.query(
          'UPDATE transfers SET status = $1, delivered_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['delivered', transfer.id]
        );

        results.push({
          transfer_id: transfer.id,
          from_location: fromLocation.name,
          to_location: toLocation.name,
          items_count: items.length
        });

        // Log audit
        await logAudit({
          userId: req.user.id,
          username: req.user.username,
          action: 'BATCH_TRANSFER_CREATE',
          tableName: 'transfers',
          recordId: transfer.id,
          newValues: { 
            from_location: fromLocation.name,
            to_location: toLocation.name,
            items_count: items.length,
            source: 'CDR_IMPORT'
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          description: `CDR batch transfer: ${items.length} items from ${fromLocation.name} to ${toLocation.name}`
        });

      } catch (itemError) {
        errors.push(`Transfer error: ${itemError.message}`);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      results,
      errors,
      message: `Batch transfer completed. ${results.length} transfers created, ${errors.length} errors.`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Unreceive transfer (admin only) - reverse a completed transfer
router.post('/:id/unreceive', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');
    
    // Get transfer details - check both transfer_items and main transfers table
    let transferResult;
    try {
      // First try to get from transfer_items (for multi-item transfers)
      transferResult = await client.query(
        `SELECT t.*, 
                fl.name as from_location_name, 
                tl.name as to_location_name,
                ti.description, ti.unit, ti.quantity, ti.unit_cost, ti.batch_number, ti.expiry_date
         FROM transfers t
         LEFT JOIN locations fl ON t.from_location_id = fl.id
         LEFT JOIN locations tl ON t.to_location_id = tl.id
         LEFT JOIN transfer_items ti ON t.id = ti.transfer_id
         WHERE t.id = $1 AND t.status = 'delivered' AND ti.description IS NOT NULL`,
        [id]
      );
      
      // If no items found in transfer_items, check main transfers table (for single-item transfers)
      if (transferResult.rows.length === 0) {
        transferResult = await client.query(
          `SELECT t.*, 
                  fl.name as from_location_name, 
                  tl.name as to_location_name,
                  t.description, t.unit, t.quantity, t.unit_cost,
                  NULL as batch_number, NULL as expiry_date
           FROM transfers t
           LEFT JOIN locations fl ON t.from_location_id = fl.id
           LEFT JOIN locations tl ON t.to_location_id = tl.id
           WHERE t.id = $1 AND t.status = 'delivered' AND t.description IS NOT NULL`,
          [id]
        );
      }
    } catch (error) {
      // If batch columns don't exist in transfer_items, try without them
      if (error.message.includes('batch_number') || error.message.includes('expiry_date')) {
        transferResult = await client.query(
          `SELECT t.*, 
                  fl.name as from_location_name, 
                  tl.name as to_location_name,
                  COALESCE(ti.description, t.description) as description, 
                  COALESCE(ti.unit, t.unit) as unit, 
                  COALESCE(ti.quantity, t.quantity) as quantity, 
                  COALESCE(ti.unit_cost, t.unit_cost) as unit_cost,
                  NULL as batch_number, NULL as expiry_date
           FROM transfers t
           LEFT JOIN locations fl ON t.from_location_id = fl.id
           LEFT JOIN locations tl ON t.to_location_id = tl.id
           LEFT JOIN transfer_items ti ON t.id = ti.transfer_id
           WHERE t.id = $1 AND t.status = 'delivered'`,
          [id]
        );
      } else {
        throw error;
      }
    }
    
    if (transferResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found or not in delivered status' });
    }
    
    const transferData = transferResult.rows[0];
    
    // Check if transfer items exist
    if (!transferData.description) {
      await client.query('ROLLBACK');
      console.log('Transfer data:', transferData); // Debug log
      return res.status(400).json({ error: 'Transfer items not found. Cannot unreceive. This transfer may not have item details stored.' });
    }
    
    // REMOVE from destination inventory
    // Note: We don't match on batch_number because transfer_items doesn't store it
    // We match on description, unit, and unit_cost to find the right inventory item
    const destInventoryResult = await client.query(
      `SELECT * FROM inventory 
       WHERE location_id = $1 AND description = $2 AND unit = $3 AND unit_cost = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [transferData.to_location_id, transferData.description, transferData.unit, transferData.unit_cost]
    );
    
    if (destInventoryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Inventory not found at destination. Cannot unreceive - items may have been sold or transferred.' 
      });
    }
    
    const destInventory = destInventoryResult.rows[0];
    
    // Check if sufficient quantity exists at destination
    if (parseFloat(destInventory.quantity) < parseFloat(transferData.quantity)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient quantity at destination. Available: ${destInventory.quantity}, Required: ${transferData.quantity}` 
      });
    }
    
    // Remove quantity from destination
    if (parseFloat(destInventory.quantity) === parseFloat(transferData.quantity)) {
      // Delete the inventory record if quantity becomes zero
      await client.query(
        'DELETE FROM inventory WHERE id = $1',
        [destInventory.id]
      );
    } else {
      // Reduce quantity
      await client.query(
        'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [transferData.quantity, destInventory.id]
      );
    }
    
    // ADD back to source inventory
    const sourceInventoryResult = await client.query(
      `SELECT * FROM inventory 
       WHERE location_id = $1 AND description = $2 AND unit = $3 AND unit_cost = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [transferData.from_location_id, transferData.description, transferData.unit, transferData.unit_cost]
    );
    
    if (sourceInventoryResult.rows.length > 0) {
      // Update existing inventory
      await client.query(
        'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [transferData.quantity, sourceInventoryResult.rows[0].id]
      );
    } else {
      // Create new inventory record at source
      // Generate a new cost_batch_id for tracking
      const costBatchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      await client.query(
        `INSERT INTO inventory 
         (location_id, description, unit, quantity, unit_cost, suggested_selling_price, 
          max_quantity, cost_batch_id, is_new_item, is_new_cost) 
         VALUES ($1, $2, $3, $4, $5, $6, $4, $7, false, false)`,
        [
          transferData.from_location_id, 
          transferData.description, 
          transferData.unit, 
          transferData.quantity, 
          transferData.unit_cost, 
          transferData.unit_cost, // Use unit_cost as suggested_selling_price
          costBatchId
        ]
      );
    }
    
    // Update transfer status back to in_transit
    const result = await client.query(
      `UPDATE transfers 
       SET status = 'in_transit', 
           delivered_by = NULL, 
           delivered_at = NULL, 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    
    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRANSFER_UNRECEIVE',
      tableName: 'transfers',
      recordId: id,
      oldValues: { status: 'delivered' },
      newValues: { status: 'in_transit' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Unreceived transfer: ${transferData.quantity} ${transferData.unit} of ${transferData.description} from ${transferData.to_location_name} back to ${transferData.from_location_name}`
    });
    
    res.json({ 
      ...result.rows[0], 
      message: 'Transfer unreceived! Inventory returned to source location and status changed to In Transit.' 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
