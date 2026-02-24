const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { notifyAdmins, notifyLocation } = require('./notifications');

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
      const sourceInventory = await client.query(
        'SELECT * FROM inventory WHERE location_id = $1 AND description = $2 AND unit = $3',
        [from_location_id, description, unit]
      );

      if (sourceInventory.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found in source location inventory' });
      }

      if (sourceInventory.rows[0].quantity < quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient quantity. Available: ${sourceInventory.rows[0].quantity}, Requested: ${quantity}` 
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
    
    // Delete all transfers
    const result = await client.query('DELETE FROM transfers');
    
    await client.query('COMMIT');
    res.json({ message: `Deleted ${result.rowCount} transfer records`, count: result.rowCount });
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

    if (inventory.rows.length === 0 || inventory.rows[0].quantity < transferData.quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Insufficient inventory to approve this transfer' 
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

    if (inventory.rows.length === 0 || inventory.rows[0].quantity < transferData.quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient inventory. Available: ${inventory.rows[0]?.quantity || 0}, Required: ${transferData.quantity}` 
      });
    }

    // DEDUCT from source inventory
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE location_id = $2 AND description = $3 AND unit = $4',
      [transferData.quantity, transferData.from_location_id, transferData.description, transferData.unit]
    );

    // Update transfer status to in_transit (no delivery record needed)
    const result = await client.query(
      `UPDATE transfers 
       SET status = 'in_transit', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');
    
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

    // ADD to destination inventory
    await client.query(
      `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, suggested_selling_price) 
       VALUES ($1, $2, $3, $4, $5, $5) 
       ON CONFLICT (location_id, description, unit) 
       DO UPDATE SET quantity = inventory.quantity + $4, updated_at = CURRENT_TIMESTAMP`,
      [transferData.to_location_id, transferData.description, transferData.unit, transferData.quantity, transferData.unit_cost]
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

    // Only creator or admin can cancel
    if (req.user.role !== 'admin' && req.user.id !== transferData.transferred_by) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the creator or admin can cancel this transfer' });
    }

    if (transferData.status === 'in_transit' || transferData.status === 'delivered') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot cancel transfer that is already shipped or delivered' });
    }

    const result = await client.query(
      `UPDATE transfers 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
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

module.exports = router;
