const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all conversations (inbox)
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT ON (other_user_id)
        other_user_id,
        other_user_name,
        other_user_role,
        last_message,
        last_message_time,
        unread_count,
        is_sender
      FROM (
        SELECT 
          CASE 
            WHEN m.sender_id = $1 THEN m.recipient_id 
            ELSE m.sender_id 
          END as other_user_id,
          CASE 
            WHEN m.sender_id = $1 THEN ru.full_name 
            ELSE su.full_name 
          END as other_user_name,
          CASE 
            WHEN m.sender_id = $1 THEN ru.role 
            ELSE su.role 
          END as other_user_role,
          m.message as last_message,
          m.created_at as last_message_time,
          CASE WHEN m.sender_id = $1 THEN true ELSE false END as is_sender,
          (
            SELECT COUNT(*) 
            FROM messages 
            WHERE recipient_id = $1 
              AND sender_id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
              AND read = false
          ) as unread_count
        FROM messages m
        LEFT JOIN users su ON m.sender_id = su.id
        LEFT JOIN users ru ON m.recipient_id = ru.id
        WHERE m.sender_id = $1 OR m.recipient_id = $1
        ORDER BY m.created_at DESC
      ) conversations
      ORDER BY other_user_id, last_message_time DESC
    `;
    
    const result = await pool.query(query, [req.user.userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages with a specific user
router.get('/conversation/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        m.id,
        m.sender_id,
        m.recipient_id,
        m.subject,
        m.message,
        m.read,
        m.created_at,
        su.full_name as sender_name,
        ru.full_name as recipient_name
      FROM messages m
      LEFT JOIN users su ON m.sender_id = su.id
      LEFT JOIN users ru ON m.recipient_id = ru.id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2)
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at ASC
    `;
    
    const result = await pool.query(query, [req.user.userId, userId]);
    
    // Mark messages as read
    await pool.query(
      'UPDATE messages SET read = true, read_at = CURRENT_TIMESTAMP WHERE recipient_id = $1 AND sender_id = $2 AND read = false',
      [req.user.userId, userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { recipient_id, subject, message } = req.body;
    
    if (!recipient_id || !message) {
      return res.status(400).json({ error: 'Recipient and message are required' });
    }
    
    const query = `
      INSERT INTO messages (sender_id, recipient_id, subject, message)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `;
    
    const result = await pool.query(query, [
      req.user.userId,
      recipient_id,
      subject || null,
      message
    ]);
    
    res.json({ 
      success: true, 
      message: 'Message sent',
      id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread message count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const query = 'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND read = false';
    const result = await pool.query(query, [req.user.userId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of users to message (admin can message everyone, others can only message admin)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    let query;
    let params;
    
    if (req.user.role === 'admin') {
      // Admin can message everyone with their location info
      query = `
        SELECT 
          u.id, 
          u.full_name, 
          u.role, 
          u.username,
          u.location_id,
          l.name as location_name
        FROM users u
        LEFT JOIN locations l ON u.location_id = l.id
        WHERE u.id != $1
        ORDER BY l.name, u.full_name
      `;
      params = [req.user.userId];
    } else {
      // Non-admin can only message admins
      query = `
        SELECT 
          u.id, 
          u.full_name, 
          u.role, 
          u.username,
          u.location_id,
          l.name as location_name
        FROM users u
        LEFT JOIN locations l ON u.location_id = l.id
        WHERE u.role = 'admin' AND u.id != $1
        ORDER BY u.full_name
      `;
      params = [req.user.userId];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark conversation as read
router.put('/mark-read/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    await pool.query(
      'UPDATE messages SET read = true, read_at = CURRENT_TIMESTAMP WHERE recipient_id = $1 AND sender_id = $2 AND read = false',
      [req.user.userId, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
