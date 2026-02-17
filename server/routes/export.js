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
    // Total inventory value
    const inventoryValue = await pool.query(`
      SELECT COALESCE(SUM(quantity * unit_cost), 0) as total_value
      FROM inventory
    `);
    
    // Total sales (last 30 days)
    const salesData = await pool.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(total_amount - (quantity * unit_cost)), 0) as total_profit,
        COUNT(*) as total_transactions
      FROM sales
      WHERE sale_date >= NOW() - INTERVAL '30 days'
    `);
    
    // Low stock items
    const lowStock = await pool.query(`
      SELECT COUNT(*) as count
      FROM inventory
      WHERE quantity < 10
    `);
    
    // Top selling products (last 30 days)
    const topProducts = await pool.query(`
      SELECT 
        description,
        SUM(quantity) as total_sold,
        SUM(total_amount) as revenue
      FROM sales
      WHERE sale_date >= NOW() - INTERVAL '30 days'
      GROUP BY description
      ORDER BY total_sold DESC
      LIMIT 5
    `);
    
    // Sales by location (last 30 days)
    const salesByLocation = await pool.query(`
      SELECT 
        l.name as location,
        COUNT(s.id) as transactions,
        COALESCE(SUM(s.total_amount), 0) as revenue
      FROM locations l
      LEFT JOIN sales s ON l.id = s.location_id AND s.sale_date >= NOW() - INTERVAL '30 days'
      WHERE l.type = 'branch'
      GROUP BY l.id, l.name
      ORDER BY revenue DESC
      LIMIT 10
    `);
    
    // Daily sales trend (last 7 days)
    const dailySales = await pool.query(`
      SELECT 
        DATE(sale_date) as date,
        COUNT(*) as transactions,
        SUM(total_amount) as revenue
      FROM sales
      WHERE sale_date >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(sale_date)
      ORDER BY date
    `);
    
    res.json({
      summary: {
        inventory_value: inventoryValue.rows[0].total_value,
        total_sales: salesData.rows[0].total_sales,
        total_profit: salesData.rows[0].total_profit,
        total_transactions: salesData.rows[0].total_transactions,
        low_stock_count: lowStock.rows[0].count
      },
      top_products: topProducts.rows,
      sales_by_location: salesByLocation.rows,
      daily_sales: dailySales.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
