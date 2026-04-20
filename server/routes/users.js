const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

// Get all users (admin only)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.role, u.location_id, 
             l.name as location_name, u.created_at,
             COALESCE(
               json_agg(
                 json_build_object(
                   'location_id', mb.location_id,
                   'location_name', ml.name
                 )
               ) FILTER (WHERE mb.location_id IS NOT NULL), '[]'
             ) as managed_branches
      FROM users u
      LEFT JOIN locations l ON u.location_id = l.id
      LEFT JOIN manager_branches mb ON u.id = mb.user_id
      LEFT JOIN locations ml ON mb.location_id = ml.id
      GROUP BY u.id, l.name
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get manager's assigned branches
router.get('/:id/branches', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check authorization - admin or the manager themselves
    if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await pool.query(`
      SELECT mb.id, mb.location_id, l.name as location_name, l.type, l.address
      FROM manager_branches mb
      JOIN locations l ON mb.location_id = l.id
      WHERE mb.user_id = $1
      ORDER BY l.name
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign manager to branch (admin only)
router.post('/:id/branches', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { location_id } = req.body;
    
    // Verify user is a manager
    const user = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.rows[0].role !== 'branch_manager') {
      return res.status(400).json({ error: 'User must be a branch manager' });
    }
    
    // Verify location exists
    const location = await pool.query('SELECT name FROM locations WHERE id = $1', [location_id]);
    if (location.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    // Add assignment
    const result = await pool.query(`
      INSERT INTO manager_branches (user_id, location_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, location_id) DO NOTHING
      RETURNING *
    `, [id, location_id]);
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'MANAGER_BRANCH_ASSIGN',
      tableName: 'manager_branches',
      recordId: result.rows[0]?.id,
      newValues: { user_id: id, location_id, location_name: location.rows[0].name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Assigned manager to branch: ${location.rows[0].name}`
    });
    
    res.status(201).json({ message: 'Manager assigned to branch successfully', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove manager from branch (admin only)
router.delete('/:id/branches/:location_id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id, location_id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM manager_branches WHERE user_id = $1 AND location_id = $2 RETURNING *',
      [id, location_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'MANAGER_BRANCH_REMOVE',
      tableName: 'manager_branches',
      recordId: result.rows[0].id,
      oldValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Removed manager from branch`
    });
    
    res.json({ message: 'Manager removed from branch successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user (admin only)
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { username, password, full_name, role, location_id } = req.body;

    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, password, full_name, role, location_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name, role, location_id',
      [username, hashedPassword, full_name, role, location_id || null]
    );

    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'USER_CREATE',
      tableName: 'users',
      recordId: result.rows[0].id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Created new user: ${username} (${role})`
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, full_name, role, location_id, password } = req.body;

    // Get old values for audit
    const oldData = await pool.query('SELECT id, username, full_name, role, location_id FROM users WHERE id = $1', [id]);

    let query;
    let params;

    if (password) {
      // If password is being updated
      const hashedPassword = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET username = $1, full_name = $2, role = $3, location_id = $4, password = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING id, username, full_name, role, location_id';
      params = [username, full_name, role, location_id || null, hashedPassword, id];
    } else {
      // Update without password
      query = 'UPDATE users SET username = $1, full_name = $2, role = $3, location_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, username, full_name, role, location_id';
      params = [username, full_name, role, location_id || null, id];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'USER_UPDATE',
      tableName: 'users',
      recordId: id,
      oldValues: oldData.rows[0],
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated user: ${username}${password ? ' (password changed)' : ''}`
    });

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if trying to delete the admin account
    const userToDelete = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    
    if (userToDelete.rows.length > 0 && userToDelete.rows[0].username === 'admin') {
      return res.status(403).json({ error: 'Cannot delete the admin account. This account is protected.' });
    }

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'USER_DELETE',
      tableName: 'users',
      recordId: id,
      oldValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted user: ${result.rows[0].username}`
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
