const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');

    const result = await pool.query(
      'SELECT id, username, full_name, role, location_id, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    if (req.user.role === 'audit') {
      const isChangePassword = req.path === '/change-password' && req.method === 'POST';
      if (!['GET', 'HEAD'].includes(req.method) && !isChangePassword) {
        return res.status(403).json({ error: 'Audit users have read-only access' });
      }
      // Audit can read any route that admin is allowed to access
      if (['GET', 'HEAD'].includes(req.method) && roles.includes('admin')) {
        return next();
      }
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

const getManagerLocationIds = async (userId) => {
  const result = await pool.query(
    'SELECT location_id FROM manager_branches WHERE manager_id = $1',
    [userId]
  );
  return result.rows.map(r => r.location_id);
};

module.exports = { auth, authorize, getManagerLocationIds };
