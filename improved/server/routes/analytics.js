const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const interval     = `${days} days`;
    const prevInterval = `${days * 2} days`;

    const isAdmin = req.user.role === 'admin';
    const filterLocationId = isAdmin
      ? (req.query.locationId ? parseInt(req.query.locationId) : null)
      : req.user.location_id;

    const locFilter = (col) => filterLocationId ? ` AND ${col} = $1` : '';
    const locParams = filterLocationId ? [filterLocationId] : [];

    const [salesData, prevData, inventoryValue, lowStock, revenueTrend, topProducts, salesByLocation] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS total_sales,
               COUNT(*) AS total_transactions,
               COALESCE(AVG(total_amount), 0) AS avg_transaction
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '${interval}'
          AND status = 'completed'
        ${locFilter('location_id')}
      `, locParams),

      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS total_sales,
               COUNT(*) AS total_transactions
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '${prevInterval}'
          AND created_at <  NOW() - INTERVAL '${interval}'
          AND status = 'completed'
        ${locFilter('location_id')}
      `, locParams),

      pool.query(`
        SELECT COALESCE(SUM(quantity * COALESCE(unit_cost, 0)), 0) AS total_value
        FROM inventory
        ${filterLocationId ? 'WHERE location_id = $1' : ''}
      `, locParams),

      pool.query(`
        SELECT COUNT(*) AS count FROM inventory
        WHERE quantity < 10
        ${locFilter('location_id')}
      `, locParams),

      pool.query(`
        SELECT DATE(created_at) AS date,
               COALESCE(SUM(total_amount), 0) AS revenue,
               COUNT(*) AS transactions
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '${interval}'
          AND status = 'completed'
        ${locFilter('location_id')}
        GROUP BY DATE(created_at) ORDER BY date
      `, locParams),

      pool.query(`
        SELECT p.name AS description,
               SUM(si.quantity) AS total_sold,
               COALESCE(SUM(si.subtotal), 0) AS revenue
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.created_at >= NOW() - INTERVAL '${interval}'
          AND s.status = 'completed'
        ${filterLocationId ? ' AND s.location_id = $1' : ''}
        GROUP BY p.id, p.name ORDER BY total_sold DESC LIMIT 10
      `, locParams),

      pool.query(`
        SELECT l.id AS location_id, l.name AS location,
               COUNT(s.id) AS transactions,
               COALESCE(SUM(s.total_amount), 0) AS revenue
        FROM locations l
        LEFT JOIN sales s ON l.id = s.location_id
          AND s.created_at >= NOW() - INTERVAL '${interval}'
          AND s.status = 'completed'
        WHERE l.type = 'branch'
        GROUP BY l.id, l.name ORDER BY revenue DESC
      `),
    ]);

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
      payment_breakdown: [],
      top_products:      topProducts.rows,
      sales_by_location: salesByLocation.rows,
      daily_sales:       revenueTrend.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
