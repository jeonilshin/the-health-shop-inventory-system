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
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);

    // Role-based location scoping
    const isAdmin = req.user.role === 'admin';
    const filterLocationId = isAdmin
      ? (req.query.locationId ? parseInt(req.query.locationId) : null)
      : req.user.location_id;

    // ── 1. Current-period sales summary ──────────────────────────────────────
    const sumParams = [days];
    let sumQuery = `
      SELECT
        COALESCE(SUM(total_amount), 0)                          AS total_sales,
        COALESCE(SUM(total_amount - (quantity * unit_cost)), 0) AS total_profit,
        COUNT(*)                                                 AS total_transactions,
        COALESCE(AVG(total_amount), 0)                          AS avg_transaction
      FROM sales
      WHERE sale_date >= CURRENT_DATE - $1
    `;
    if (filterLocationId) { sumQuery += ` AND location_id = $2`; sumParams.push(filterLocationId); }
    const salesData = await pool.query(sumQuery, sumParams);

    // ── 2. Previous-period comparison ─────────────────────────────────────────
    const prevParams = [days * 2, days];
    let prevQuery = `
      SELECT
        COALESCE(SUM(total_amount), 0)                          AS total_sales,
        COALESCE(SUM(total_amount - (quantity * unit_cost)), 0) AS total_profit,
        COUNT(*)                                                 AS total_transactions
      FROM sales
      WHERE sale_date >= CURRENT_DATE - $1
        AND sale_date <  CURRENT_DATE - $2
    `;
    if (filterLocationId) { prevQuery += ` AND location_id = $3`; prevParams.push(filterLocationId); }
    const prevData = await pool.query(prevQuery, prevParams);

    // ── 3. Inventory value ────────────────────────────────────────────────────
    const invParams = [];
    let invQuery = `SELECT COALESCE(SUM(quantity * unit_cost), 0) AS total_value FROM inventory`;
    if (filterLocationId) { invQuery += ` WHERE location_id = $1`; invParams.push(filterLocationId); }
    const inventoryValue = await pool.query(invQuery, invParams);

    // ── 4. Low-stock count ────────────────────────────────────────────────────
    const lsParams = [];
    let lsQuery = `SELECT COUNT(*) AS count FROM inventory WHERE quantity < 10`;
    if (filterLocationId) { lsQuery += ` AND location_id = $1`; lsParams.push(filterLocationId); }
    const lowStock = await pool.query(lsQuery, lsParams);

    // ── 5. Daily revenue & profit trend ──────────────────────────────────────
    const trendParams = [days];
    let trendQuery = `
      SELECT
        DATE(sale_date)                                          AS date,
        COALESCE(SUM(total_amount), 0)                          AS revenue,
        COALESCE(SUM(total_amount - (quantity * unit_cost)), 0) AS profit,
        COUNT(*)                                                 AS transactions
      FROM sales
      WHERE sale_date >= CURRENT_DATE - $1
    `;
    if (filterLocationId) { trendQuery += ` AND location_id = $2`; trendParams.push(filterLocationId); }
    trendQuery += ` GROUP BY DATE(sale_date) ORDER BY date`;
    const revenueTrend = await pool.query(trendQuery, trendParams);

    // ── 6. Payment-method breakdown (from sales_transactions) ─────────────────
    const payParams = [days];
    let payQuery = `
      SELECT
        COALESCE(payment_method, 'other')  AS payment_method,
        COUNT(*)                           AS transactions,
        COALESCE(SUM(total_amount), 0)     AS revenue
      FROM sales_transactions
      WHERE transaction_date >= CURRENT_DATE - $1
        AND (cancellation_status IS NULL OR cancellation_status = 'rejected')
    `;
    if (filterLocationId) { payQuery += ` AND location_id = $2`; payParams.push(filterLocationId); }
    payQuery += ` GROUP BY payment_method ORDER BY revenue DESC`;
    const paymentBreakdown = await pool.query(payQuery, payParams);

    // ── 7. Top selling products ───────────────────────────────────────────────
    const prodParams = [days];
    let prodQuery = `
      SELECT
        description,
        SUM(quantity)    AS total_sold,
        SUM(total_amount) AS revenue
      FROM sales
      WHERE sale_date >= CURRENT_DATE - $1
    `;
    if (filterLocationId) { prodQuery += ` AND location_id = $2`; prodParams.push(filterLocationId); }
    prodQuery += ` GROUP BY description ORDER BY total_sold DESC LIMIT 10`;
    const topProducts = await pool.query(prodQuery, prodParams);

    // ── 8. Branch performance ─────────────────────────────────────────────────
    const salesByLocation = await pool.query(`
      SELECT
        l.id                                                         AS location_id,
        l.name                                                       AS location,
        COUNT(s.id)                                                  AS transactions,
        COALESCE(SUM(s.total_amount), 0)                             AS revenue,
        COALESCE(SUM(s.total_amount - (s.quantity * s.unit_cost)), 0) AS profit
      FROM locations l
      LEFT JOIN sales s ON l.id = s.location_id
        AND s.sale_date >= CURRENT_DATE - $1
      WHERE l.type = 'branch'
      GROUP BY l.id, l.name
      ORDER BY revenue DESC
    `, [days]);

    // ── 9. Cash-flow trend (from daily sales_reports) ─────────────────────────
    const cfParams = [days];
    let cfQuery = `
      SELECT
        sr.report_date,
        COALESCE(SUM(sr.net_cash_receipts),    0) AS net_cash_receipts,
        COALESCE(SUM(sr.actual_cash_deposited), 0) AS deposited,
        COALESCE(SUM(sr.cash_overage_shortage), 0) AS overage_shortage,
        COALESCE(SUM(sr.total_disbursements),   0) AS disbursements,
        COALESCE(SUM(sr.net_sales),             0) AS net_sales
      FROM sales_reports sr
      WHERE sr.report_date >= CURRENT_DATE - $1
        AND sr.report_type = 'daily'
    `;
    if (filterLocationId) { cfQuery += ` AND sr.location_id = $2`; cfParams.push(filterLocationId); }
    cfQuery += ` GROUP BY sr.report_date ORDER BY sr.report_date`;
    const cashFlowTrend = await pool.query(cfQuery, cfParams);

    res.json({
      summary: {
        inventory_value:    inventoryValue.rows[0].total_value,
        total_sales:        salesData.rows[0].total_sales,
        total_profit:       salesData.rows[0].total_profit,
        total_transactions: salesData.rows[0].total_transactions,
        avg_transaction:    salesData.rows[0].avg_transaction,
        low_stock_count:    lowStock.rows[0].count,
        prev_sales:         prevData.rows[0].total_sales,
        prev_profit:        prevData.rows[0].total_profit,
        prev_transactions:  prevData.rows[0].total_transactions,
      },
      revenue_trend:     revenueTrend.rows,
      payment_breakdown: paymentBreakdown.rows,
      top_products:      topProducts.rows,
      sales_by_location: salesByLocation.rows,
      cash_flow_trend:   cashFlowTrend.rows,
      daily_sales:       revenueTrend.rows, // backward compat
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
