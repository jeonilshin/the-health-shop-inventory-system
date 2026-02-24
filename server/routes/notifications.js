const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

// Get user notifications
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
router.put('/read-all', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = true WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to create notification (used by other routes)
async function createNotification(userId, type, title, message, link = null) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, link]
    );
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// Helper function to notify all admins
async function notifyAdmins(type, title, message, link = null) {
  try {
    const admins = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
    for (const admin of admins.rows) {
      await createNotification(admin.id, type, title, message, link);
    }
  } catch (error) {
    console.error('Error notifying admins:', error);
  }
}

// Helper function to notify users at a location
async function notifyLocation(locationId, type, title, message, link = null) {
  try {
    const users = await pool.query(
      'SELECT id FROM users WHERE location_id = $1 AND role IN ($2, $3)',
      [locationId, 'branch_manager', 'warehouse']
    );
    for (const user of users.rows) {
      await createNotification(user.id, type, title, message, link);
    }
  } catch (error) {
    console.error('Error notifying location:', error);
  }
}

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyAdmins = notifyAdmins;
module.exports.notifyLocation = notifyLocation;
