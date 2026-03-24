const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

// Get all counts for navigation badges
router.get('/', auth, async (req, res) => {
  try {
    const counts = {
      messages: 0,
      transfers: 0,
      deliveries: 0,
      discrepancies: 0
    };

    // 1. Unread messages count
    const messagesResult = await pool.query(
      `SELECT COUNT(*) FROM messages 
       WHERE recipient_id = $1 AND read = false`,
      [req.user.id]
    );
    counts.messages = parseInt(messagesResult.rows[0].count);

    // 2. Pending transfers count (admin only)
    if (req.user.role === 'admin') {
      const transfersResult = await pool.query(
        `SELECT COUNT(*) FROM transfers WHERE status = 'pending'`
      );
      counts.transfers = parseInt(transfersResult.rows[0].count);
    }

    // 3. Deliveries count
    if (req.user.role === 'admin') {
      // Admin: count deliveries awaiting admin confirmation
      const deliveriesResult = await pool.query(
        `SELECT COUNT(*) FROM deliveries WHERE status = 'awaiting_admin'`
      );
      counts.deliveries = parseInt(deliveriesResult.rows[0].count);
    } else if (req.user.role === 'branch_manager') {
      // Branch manager: count deliveries ready to accept (admin_confirmed or in_transit)
      const deliveriesResult = await pool.query(
        `SELECT COUNT(*) FROM deliveries 
         WHERE to_location_id = $1 
         AND status IN ('admin_confirmed', 'in_transit')`,
        [req.user.location_id]
      );
      counts.deliveries = parseInt(deliveriesResult.rows[0].count);
    }

    // 4. Discrepancies count (admin only - pending discrepancies)
    if (req.user.role === 'admin') {
      const discrepanciesResult = await pool.query(
        `SELECT COUNT(*) FROM delivery_discrepancies WHERE status = 'pending'`
      );
      counts.discrepancies = parseInt(discrepanciesResult.rows[0].count);
    }

    res.json(counts);
  } catch (error) {
    console.error('Error fetching counts:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
