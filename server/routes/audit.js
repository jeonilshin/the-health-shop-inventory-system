const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

// Get audit logs (admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { 
      user_id, 
      action, 
      table_name, 
      start_date, 
      end_date,
      limit = 100,
      offset = 0 
    } = req.query;

    let query = `
      SELECT 
        al.*,
        u.full_name
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (user_id) {
      query += ` AND al.user_id = $${paramCount}`;
      params.push(user_id);
      paramCount++;
    }

    if (action) {
      query += ` AND al.action = $${paramCount}`;
      params.push(action);
      paramCount++;
    }

    if (table_name) {
      query += ` AND al.table_name = $${paramCount}`;
      params.push(table_name);
      paramCount++;
    }

    if (start_date) {
      query += ` AND al.created_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND al.created_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM audit_log al
      WHERE 1=1
      ${user_id ? `AND al.user_id = ${user_id}` : ''}
      ${action ? `AND al.action = '${action}'` : ''}
      ${table_name ? `AND al.table_name = '${table_name}'` : ''}
      ${start_date ? `AND al.created_at >= '${start_date}'` : ''}
      ${end_date ? `AND al.created_at <= '${end_date}'` : ''}
    `;
    const countResult = await pool.query(countQuery);

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Error fetching audit logs' });
  }
});

// Get audit log statistics (admin only)
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_logs,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN action LIKE '%CREATE%' THEN 1 END) as creates,
        COUNT(CASE WHEN action LIKE '%UPDATE%' THEN 1 END) as updates,
        COUNT(CASE WHEN action LIKE '%DELETE%' THEN 1 END) as deletes,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as last_7d
      FROM audit_log
    `);

    const topUsers = await pool.query(`
      SELECT 
        u.full_name,
        u.username,
        COUNT(*) as action_count
      FROM audit_log al
      JOIN users u ON al.user_id = u.id
      WHERE al.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.id, u.full_name, u.username
      ORDER BY action_count DESC
      LIMIT 5
    `);

    const recentActions = await pool.query(`
      SELECT 
        action,
        COUNT(*) as count
      FROM audit_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      stats: stats.rows[0],
      topUsers: topUsers.rows,
      recentActions: recentActions.rows
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ error: 'Error fetching audit statistics' });
  }
});

module.exports = router;
