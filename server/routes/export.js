const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Export inventory to CSV
router.get('/inventory', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l.name as location,
        l.type as location_type,
        i.description,
        i.unit,
        i.quantity,
        i.unit_cost,
        i.suggested_selling_price,
        (i.quantity * i.unit_cost) as total_value,
        i.created_at,
        i.updated_at
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      ORDER BY l.name, i.description
    `);
    
    // Convert to CSV
    const headers = ['Location', 'Type', 'Description', 'Unit', 'Quantity', 'Unit Cost', 'Selling Price', 'Total Value', 'Created', 'Updated'];
    const csv = [
      headers.join(','),
      ...result.rows.map(row => [
        `"${row.location}"`,
        row.location_type,
        `"${row.description}"`,
        row.unit,
        row.quantity,
        row.unit_cost,
        row.suggested_selling_price || 0,
        row.total_value,
        row.created_at,
        row.updated_at
      ].join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=inventory-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export sales to CSV
router.get('/sales', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.sale_date,
        l.name as location,
        s.description,
        s.unit,
        s.quantity,
        s.unit_cost,
        s.selling_price,
        s.total_amount,
        (s.total_amount - (s.quantity * s.unit_cost)) as profit,
        s.customer_name,
        u.full_name as sold_by
      FROM sales s
      JOIN locations l ON s.location_id = l.id
      JOIN users u ON s.sold_by = u.id
      ORDER BY s.sale_date DESC
    `);
    
    const headers = ['Date', 'Location', 'Description', 'Unit', 'Quantity', 'Cost', 'Price', 'Total', 'Profit', 'Customer', 'Sold By'];
    const csv = [
      headers.join(','),
      ...result.rows.map(row => [
        row.sale_date,
        `"${row.location}"`,
        `"${row.description}"`,
        row.unit,
        row.quantity,
        row.unit_cost,
        row.selling_price,
        row.total_amount,
        row.profit,
        `"${row.customer_name || ''}"`,
        `"${row.sold_by}"`
      ].join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analytics data
router.get('/analytics', auth, async (req, res) => {
  try {
    // days is validated to a safe integer — safe to interpolate directly
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const interval     = `${days} days`;
    const prevInterval = `${days * 2} days`;

    // Role-based location scoping
    const isAdmin = req.user.role === 'admin';
    const filterLocationId = isAdmin
      ? (req.query.locationId ? parseInt(req.query.locationId) : null)
      : req.user.location_id;

    // Helper: optionally append location filter
    // When filterLocationId is set, $1 = filterLocationId
    const locFilter  = (col) => filterLocationId ? ` AND ${col} = $1` : '';
    const locParams  = filterLocationId ? [filterLocationId] : [];

    // ── 1. Current-period sales summary ──────────────────────────────────────
    const salesData = await pool.query(`
      SELECT
        COALESCE(SUM(total_amount), 0)  AS total_sales,
        COUNT(*)                        AS total_transactions,
        COALESCE(AVG(total_amount), 0)  AS avg_transaction
      FROM sales_transactions
      WHERE transaction_date >= NOW() - INTERVAL '${interval}'
        AND (cancellation_status IS NULL OR cancellation_status = 'rejected')
      ${locFilter('location_id')}
    `, locParams);

    // ── 2. Previous-period comparison ─────────────────────────────────────────
    const prevData = await pool.query(`
      SELECT
        COALESCE(SUM(total_amount), 0) AS total_sales,
        COUNT(*)                       AS total_transactions
      FROM sales_transactions
      WHERE transaction_date >= NOW() - INTERVAL '${prevInterval}'
        AND transaction_date <  NOW() - INTERVAL '${interval}'
        AND (cancellation_status IS NULL OR cancellation_status = 'rejected')
      ${locFilter('location_id')}
    `, locParams);

    // ── 3. Inventory value ────────────────────────────────────────────────────
    const inventoryValue = await pool.query(`
      SELECT COALESCE(SUM(quantity * unit_cost), 0) AS total_value
      FROM inventory
      ${filterLocationId ? 'WHERE location_id = $1' : ''}
    `, locParams);

    // ── 4. Low-stock count ────────────────────────────────────────────────────
    const lowStock = await pool.query(`
      SELECT COUNT(*) AS count
      FROM inventory
      WHERE quantity < 10
      ${locFilter('location_id')}
    `, locParams);

    // ── 5. Daily revenue trend ────────────────────────────────────────────────
    const revenueTrend = await pool.query(`
      SELECT
        transaction_date               AS date,
        COALESCE(SUM(total_amount), 0) AS revenue,
        COUNT(*)                       AS transactions
      FROM sales_transactions
      WHERE transaction_date >= NOW() - INTERVAL '${interval}'
        AND (cancellation_status IS NULL OR cancellation_status = 'rejected')
      ${locFilter('location_id')}
      GROUP BY transaction_date
      ORDER BY transaction_date
    `, locParams);

    // ── 6. Payment-method breakdown ───────────────────────────────────────────
    const paymentBreakdown = await pool.query(`
      SELECT
        COALESCE(payment_method, 'other') AS payment_method,
        COUNT(*)                          AS transactions,
        COALESCE(SUM(total_amount), 0)    AS revenue
      FROM sales_transactions
      WHERE transaction_date >= NOW() - INTERVAL '${interval}'
        AND (cancellation_status IS NULL OR cancellation_status = 'rejected')
      ${locFilter('location_id')}
      GROUP BY payment_method
      ORDER BY revenue DESC
    `, locParams);

    // ── 7. Top selling products ───────────────────────────────────────────────
    const topProducts = await pool.query(`
      SELECT
        item_description              AS description,
        SUM(quantity_sold)            AS total_sold,
        SUM(total_amount)             AS revenue
      FROM sales_transactions
      WHERE transaction_date >= NOW() - INTERVAL '${interval}'
        AND (cancellation_status IS NULL OR cancellation_status = 'rejected')
      ${locFilter('location_id')}
      GROUP BY item_description
      ORDER BY total_sold DESC
      LIMIT 10
    `, locParams);

    // ── 8. Branch performance ─────────────────────────────────────────────────
    const salesByLocation = await pool.query(`
      SELECT
        l.id                               AS location_id,
        l.name                             AS location,
        COUNT(st.id)                       AS transactions,
        COALESCE(SUM(st.total_amount), 0)  AS revenue
      FROM locations l
      LEFT JOIN sales_transactions st ON l.id = st.location_id
        AND st.transaction_date >= NOW() - INTERVAL '${interval}'
        AND (st.cancellation_status IS NULL OR st.cancellation_status = 'rejected')
      WHERE l.type = 'branch'
      GROUP BY l.id, l.name
      ORDER BY revenue DESC
    `);

    // ── 9. Cash-flow trend (from daily sales_reports) ─────────────────────────
    const cashFlowTrend = await pool.query(`
      SELECT
        sr.report_date,
        COALESCE(SUM(sr.net_cash_receipts),     0) AS net_cash_receipts,
        COALESCE(SUM(sr.actual_cash_deposited), 0) AS deposited,
        COALESCE(SUM(sr.cash_overage_shortage), 0) AS overage_shortage,
        COALESCE(SUM(sr.total_disbursements),   0) AS disbursements,
        COALESCE(SUM(sr.net_sales),             0) AS net_sales
      FROM sales_reports sr
      WHERE sr.report_date >= NOW() - INTERVAL '${interval}'
        AND sr.report_type = 'daily'
      ${locFilter('sr.location_id')}
      GROUP BY sr.report_date
      ORDER BY sr.report_date
    `, locParams);

    res.json({
      summary: {
        inventory_value:    inventoryValue.rows[0].total_value,
        total_sales:        salesData.rows[0].total_sales,
        total_transactions: salesData.rows[0].total_transactions,
        avg_transaction:    salesData.rows[0].avg_transaction,
        low_stock_count:    lowStock.rows[0].count,
        prev_sales:         prevData.rows[0].total_sales,
        prev_transactions:  prevData.rows[0].total_transactions,
      },
      revenue_trend:     revenueTrend.rows,
      payment_breakdown: paymentBreakdown.rows,
      top_products:      topProducts.rows,
      sales_by_location: salesByLocation.rows,
      cash_flow_trend:   cashFlowTrend.rows,
      daily_sales:       revenueTrend.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
