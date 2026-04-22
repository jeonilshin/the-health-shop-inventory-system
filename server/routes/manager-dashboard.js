const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize, getManagerLocations } = require('../middleware/auth');

// Manager Dashboard - Overview of all managed branches
router.get('/overview', auth, authorize('branch_manager'), async (req, res) => {
  try {
    const managerLocations = await getManagerLocations(req.user.id);
    const locationIds = managerLocations.map(l => l.id);
    
    if (locationIds.length === 0) {
      return res.json({
        branches: [],
        totalInventoryValue: 0,
        totalSalesToday: 0,
        pendingTransfers: 0,
        lowStockItems: 0
      });
    }

    // Get branch summaries
    const branchSummaries = await pool.query(`
      SELECT 
        l.id,
        l.name,
        l.address,
        COALESCE(inv_summary.total_items, 0) as total_items,
        COALESCE(inv_summary.total_value, 0) as total_inventory_value,
        COALESCE(sales_today.total_sales, 0) as sales_today,
        COALESCE(pending_transfers.count, 0) as pending_transfers,
        COALESCE(low_stock.count, 0) as low_stock_items
      FROM locations l
      LEFT JOIN (
        SELECT 
          location_id,
          COUNT(*) as total_items,
          SUM(quantity * unit_cost) as total_value
        FROM inventory 
        WHERE quantity > 0
        GROUP BY location_id
      ) inv_summary ON l.id = inv_summary.location_id
      LEFT JOIN (
        SELECT 
          location_id,
          SUM(total_amount) as total_sales
        FROM sales_transactions 
        WHERE DATE(transaction_date) = CURRENT_DATE
        GROUP BY location_id
      ) sales_today ON l.id = sales_today.location_id
      LEFT JOIN (
        SELECT 
          to_location_id as location_id,
          COUNT(*) as count
        FROM transfers 
        WHERE status = 'pending' AND requires_manager_approval = true
        GROUP BY to_location_id
      ) pending_transfers ON l.id = pending_transfers.location_id
      LEFT JOIN (
        SELECT 
          location_id,
          COUNT(*) as count
        FROM inventory 
        WHERE quantity <= 10 AND quantity > 0
        GROUP BY location_id
      ) low_stock ON l.id = low_stock.location_id
      WHERE l.id = ANY($1)
      ORDER BY l.name
    `, [locationIds]);

    // Calculate totals
    const totals = branchSummaries.rows.reduce((acc, branch) => ({
      totalInventoryValue: acc.totalInventoryValue + parseFloat(branch.total_inventory_value || 0),
      totalSalesToday: acc.totalSalesToday + parseFloat(branch.sales_today || 0),
      pendingTransfers: acc.pendingTransfers + parseInt(branch.pending_transfers || 0),
      lowStockItems: acc.lowStockItems + parseInt(branch.low_stock_items || 0)
    }), {
      totalInventoryValue: 0,
      totalSalesToday: 0,
      pendingTransfers: 0,
      lowStockItems: 0
    });

    res.json({
      branches: branchSummaries.rows,
      ...totals
    });
  } catch (error) {
    console.error('Manager dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending approvals for manager
router.get('/pending-approvals', auth, authorize('branch_manager'), async (req, res) => {
  try {
    const managerLocations = await getManagerLocations(req.user.id);
    const locationIds = managerLocations.map(l => l.id);
    
    if (locationIds.length === 0) {
      return res.json([]);
    }

    // Get transfers requiring manager approval
    const transfers = await pool.query(`
      SELECT 
        t.*,
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as requested_by_name,
        u.role as requested_by_role
      FROM transfers t
      JOIN locations fl ON t.from_location_id = fl.id
      JOIN locations tl ON t.to_location_id = tl.id
      JOIN users u ON t.transferred_by = u.id
      WHERE t.status = 'pending' 
        AND t.requires_manager_approval = true
        AND t.manager_approved_by IS NULL
        AND (t.from_location_id = ANY($1) OR t.to_location_id = ANY($1))
      ORDER BY t.transfer_date DESC
    `, [locationIds]);

    // Get deliveries requiring manager confirmation
    const deliveries = await pool.query(`
      SELECT 
        d.*,
        fl.name as from_location_name,
        tl.name as to_location_name,
        u.full_name as accepted_by_name,
        json_agg(
          json_build_object(
            'description', di.description,
            'unit', di.unit,
            'quantity', di.quantity,
            'unit_cost', di.unit_cost
          )
        ) as items
      FROM deliveries d
      JOIN locations fl ON d.from_location_id = fl.id
      JOIN locations tl ON d.to_location_id = tl.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE d.status = 'awaiting_manager_confirmation'
        AND d.requires_manager_approval = true
        AND d.manager_confirmed_by IS NULL
        AND d.to_location_id = ANY($1)
      GROUP BY d.id, fl.name, tl.name, u.full_name
      ORDER BY d.created_at DESC
    `, [locationIds]);

    res.json({
      transfers: transfers.rows,
      deliveries: deliveries.rows
    });
  } catch (error) {
    console.error('Pending approvals error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manager approve transfer
router.post('/transfers/:id/approve', auth, authorize('branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
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
    
    // Check if manager has access to this transfer
    const managerLocations = await getManagerLocations(req.user.id);
    const locationIds = managerLocations.map(l => l.id);
    
    const hasAccess = locationIds.includes(transferData.from_location_id) || 
                     locationIds.includes(transferData.to_location_id);
    
    if (!hasAccess) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to this transfer' });
    }
    
    // Check if transfer requires manager approval and hasn't been approved yet
    if (!transferData.requires_manager_approval || transferData.manager_approved_by) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfer does not require manager approval or already approved' });
    }
    
    // Approve the transfer
    await client.query(`
      UPDATE transfers 
      SET manager_approved_by = $1, 
          manager_approved_at = CURRENT_TIMESTAMP,
          notes = COALESCE(notes, '') || CASE WHEN notes IS NOT NULL AND notes != '' THEN E'\n' ELSE '' END || $2
      WHERE id = $3
    `, [req.user.id, notes || `Manager approved by ${req.user.full_name}`, id]);
    
    await client.query('COMMIT');
    
    // Log audit
    const { logAudit } = require('../middleware/auditLog');
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'MANAGER_APPROVE_TRANSFER',
      tableName: 'transfers',
      recordId: id,
      description: `Manager approved transfer #${id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    // Notify admins that transfer is ready for final approval
    const { notifyAdmins } = require('./notifications');
    await notifyAdmins(
      'Transfer Ready for Admin Approval',
      `Transfer #${id} has been approved by manager ${req.user.full_name} and is ready for admin approval.`,
      'transfer_manager_approved',
      { transfer_id: id }
    );
    
    res.json({ message: 'Transfer approved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Manager approve transfer error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Manager confirm delivery
router.post('/deliveries/:id/confirm', auth, authorize('branch_manager'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    await client.query('BEGIN');
    
    // Get delivery details
    const delivery = await client.query(
      'SELECT * FROM deliveries WHERE id = $1',
      [id]
    );
    
    if (delivery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    const deliveryData = delivery.rows[0];
    
    // Check if manager has access to this delivery
    const managerLocations = await getManagerLocations(req.user.id);
    const locationIds = managerLocations.map(l => l.id);
    
    if (!locationIds.includes(deliveryData.to_location_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to this delivery' });
    }
    
    // Check if delivery requires manager confirmation
    if (!deliveryData.requires_manager_approval || deliveryData.manager_confirmed_by) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Delivery does not require manager confirmation or already confirmed' });
    }
    
    // Confirm the delivery
    await client.query(`
      UPDATE deliveries 
      SET manager_confirmed_by = $1, 
          manager_confirmed_at = CURRENT_TIMESTAMP,
          status = 'admin_confirmed',
          notes = COALESCE(notes, '') || CASE WHEN notes IS NOT NULL AND notes != '' THEN E'\n' ELSE '' END || $2
      WHERE id = $3
    `, [req.user.id, notes || `Manager confirmed by ${req.user.full_name}`, id]);
    
    await client.query('COMMIT');
    
    // Log audit
    const { logAudit } = require('../middleware/auditLog');
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'MANAGER_CONFIRM_DELIVERY',
      tableName: 'deliveries',
      recordId: id,
      description: `Manager confirmed delivery #${id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ message: 'Delivery confirmed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Manager confirm delivery error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;