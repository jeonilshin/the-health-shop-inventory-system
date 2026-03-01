const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

// Get all sales reports (admin sees all, others see their location only)
router.get('/', auth, async (req, res) => {
  try {
    const { type, status, startDate, endDate } = req.query;
    
    let query = `
      SELECT sr.*, l.name as location_name, l.type as location_type,
             u.full_name as submitted_by_full_name,
             r.full_name as reviewed_by_full_name
      FROM sales_reports sr
      JOIN locations l ON sr.location_id = l.id
      LEFT JOIN users u ON sr.submitted_by = u.id
      LEFT JOIN users r ON sr.reviewed_by = r.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by location for non-admin users
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ` AND sr.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    }
    
    // Filter by report type
    if (type) {
      query += ` AND sr.report_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }
    
    // Filter by status
    if (status) {
      query += ` AND sr.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    // Filter by date range
    if (startDate) {
      query += ` AND sr.report_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      query += ` AND sr.report_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    query += ' ORDER BY sr.report_date DESC, l.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single sales report
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT sr.*, l.name as location_name, l.type as location_type,
              u.full_name as submitted_by_full_name,
              r.full_name as reviewed_by_full_name
       FROM sales_reports sr
       JOIN locations l ON sr.location_id = l.id
       LEFT JOIN users u ON sr.submitted_by = u.id
       LEFT JOIN users r ON sr.reviewed_by = r.id
       WHERE sr.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Check access
    if (req.user.role !== 'admin' && req.user.location_id != result.rows[0].location_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit new sales report
router.post('/', auth, authorize('admin', 'warehouse', 'branch_manager', 'branch_staff'), async (req, res) => {
  try {
    const {
      report_date, report_type, location_id,
      cash_beginning, cash_sales_external, consignment, gross_sales,
      sales_discount, sales_return, total_net_cash_sales,
      delivery_fee, other_income, total_cash_receipts,
      maya_pos_qr, gcash_qr, gross_credit_sales,
      credit_sales_discount, credit_sales_return, total_net_credit_receipts,
      meals, fare, other_disbursements, total_disbursements,
      net_cash_receipts, actual_cash_deposited, cash_on_hand_available,
      cash_overage_shortage, cash_beginning_next_day,
      net_sales, notes
    } = req.body;
    
    // Validate location access
    if (req.user.role !== 'admin' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'You can only submit reports for your assigned location' });
    }
    
    const result = await pool.query(
      `INSERT INTO sales_reports (
        report_date, report_type, location_id, submitted_by, submitted_by_name,
        cash_beginning, cash_sales_external, consignment, gross_sales,
        sales_discount, sales_return, total_net_cash_sales,
        delivery_fee, other_income, total_cash_receipts,
        maya_pos_qr, gcash_qr, gross_credit_sales,
        credit_sales_discount, credit_sales_return, total_net_credit_receipts,
        meals, fare, other_disbursements, total_disbursements,
        net_cash_receipts, actual_cash_deposited, cash_on_hand_available,
        cash_overage_shortage, cash_beginning_next_day,
        net_sales, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32
      )
      ON CONFLICT (location_id, report_date, report_type)
      DO UPDATE SET
        cash_beginning = $6, cash_sales_external = $7, consignment = $8, gross_sales = $9,
        sales_discount = $10, sales_return = $11, total_net_cash_sales = $12,
        delivery_fee = $13, other_income = $14, total_cash_receipts = $15,
        maya_pos_qr = $16, gcash_qr = $17, gross_credit_sales = $18,
        credit_sales_discount = $19, credit_sales_return = $20, total_net_credit_receipts = $21,
        meals = $22, fare = $23, other_disbursements = $24, total_disbursements = $25,
        net_cash_receipts = $26, actual_cash_deposited = $27, cash_on_hand_available = $28,
        cash_overage_shortage = $29, cash_beginning_next_day = $30,
        net_sales = $31, notes = $32, updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        report_date, report_type, location_id, req.user.id, req.user.full_name || req.user.username,
        cash_beginning || 0, cash_sales_external || 0, consignment || 0, gross_sales || 0,
        sales_discount || 0, sales_return || 0, total_net_cash_sales || 0,
        delivery_fee || 0, other_income || 0, total_cash_receipts || 0,
        maya_pos_qr || 0, gcash_qr || 0, gross_credit_sales || 0,
        credit_sales_discount || 0, credit_sales_return || 0, total_net_credit_receipts || 0,
        meals || 0, fare || 0, other_disbursements || 0, total_disbursements || 0,
        net_cash_receipts || 0, actual_cash_deposited || 0, cash_on_hand_available || 0,
        cash_overage_shortage || 0, cash_beginning_next_day || 0,
        net_sales || 0, notes
      ]
    );
    
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALES_REPORT_SUBMIT',
      tableName: 'sales_reports',
      recordId: result.rows[0].id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Submitted ${report_type} sales report for ${report_date}`
    });
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update report status (admin only)
router.patch('/:id/status', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['submitted', 'reviewed', 'approved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const oldData = await pool.query('SELECT * FROM sales_reports WHERE id = $1', [id]);
    
    const result = await pool.query(
      `UPDATE sales_reports 
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [status, req.user.id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALES_REPORT_STATUS_UPDATE',
      tableName: 'sales_reports',
      recordId: id,
      oldValues: oldData.rows[0],
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated report status to ${status}`
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete report (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const report = await pool.query('SELECT * FROM sales_reports WHERE id = $1', [id]);
    
    if (report.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    await pool.query('DELETE FROM sales_reports WHERE id = $1', [id]);
    
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALES_REPORT_DELETE',
      tableName: 'sales_reports',
      recordId: id,
      oldValues: report.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted sales report`
    });
    
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
