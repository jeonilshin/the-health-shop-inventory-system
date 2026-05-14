const jwt = require('jsonwebtoken');

/**
 * Authenticate a request via Bearer JWT token.
 * Sets req.user on success, returns JSON error on failure.
 */
const auth = (req, res, next) => {
  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Audit role is strictly view-only. Block any non-GET/HEAD request,
    // except letting them change their own password.
    if (decoded.role === 'audit' && req.method !== 'GET' && req.method !== 'HEAD') {
      const isChangePassword =
        (req.baseUrl === '/api/auth' && req.path === '/change-password') ||
        req.originalUrl === '/api/auth/change-password';
      if (!isChangePassword) {
        return res.status(403).json({ error: 'Audit accounts are view-only.' });
      }
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please log in again.' });
    }
    return res.status(401).json({ error: 'Authentication failed.' });
  }
};

/**
 * Authorize a request to one or more roles.
 * Must be used after the auth middleware.
 *
 * The 'audit' role is a view-only account: on safe HTTP methods (GET/HEAD),
 * it is granted access wherever 'admin' is allowed. It is never granted access
 * on writes — those are blocked at this layer.
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const isSafeRead = req.method === 'GET' || req.method === 'HEAD';
  const auditAllowed = isSafeRead && roles.includes('admin');
  if (!roles.includes(req.user.role) && !(req.user.role === 'audit' && auditAllowed)) {
    return res.status(403).json({
      error: `Access denied. Required role: ${roles.join(' or ')}.`,
    });
  }
  next();
};

/**
 * Check if user (manager or admin) has access to a specific location.
 * For managers, checks both primary location_id and manager_branches table.
 * For admin, always returns true.
 */
const hasLocationAccess = async (userId, userRole, locationId) => {
  if (userRole === 'admin' || userRole === 'audit') return true;
  
  const pool = require('../config/database');
  
  // Check primary location
  const userCheck = await pool.query(
    'SELECT location_id FROM users WHERE id = $1',
    [userId]
  );
  
  if (userCheck.rows.length > 0 && userCheck.rows[0].location_id == locationId) {
    return true;
  }
  
  // Check manager_branches for multi-branch managers
  if (userRole === 'branch_manager') {
    const branchCheck = await pool.query(
      'SELECT 1 FROM manager_branches WHERE user_id = $1 AND location_id = $2',
      [userId, locationId]
    );
    return branchCheck.rows.length > 0;
  }
  
  return false;
};

/**
 * Get all locations a manager has access to (including primary and assigned branches)
 */
const getManagerLocations = async (userId, userRole = null) => {
  const pool = require('../config/database');
  
  if (userRole === 'admin' || userRole === 'audit') {
    // Admin / audit have read access to all locations
    const result = await pool.query('SELECT * FROM locations ORDER BY name');
    return result.rows;
  }
  
  const locationIds = [];
  
  // Get primary location
  const userCheck = await pool.query(
    'SELECT location_id FROM users WHERE id = $1',
    [userId]
  );
  
  if (userCheck.rows.length > 0 && userCheck.rows[0].location_id) {
    locationIds.push(userCheck.rows[0].location_id);
  }
  
  // Get assigned branches for managers
  if (userRole === 'branch_manager' || !userRole) {
    const branchCheck = await pool.query(
      'SELECT location_id FROM manager_branches WHERE user_id = $1',
      [userId]
    );
    locationIds.push(...branchCheck.rows.map(r => r.location_id));
  }
  
  // Remove duplicates and get full location details
  const uniqueLocationIds = [...new Set(locationIds)];
  
  if (uniqueLocationIds.length === 0) {
    return [];
  }
  
  const locationsResult = await pool.query(
    'SELECT * FROM locations WHERE id = ANY($1) ORDER BY name',
    [uniqueLocationIds]
  );
  
  return locationsResult.rows;
};

/**
 * Optional auth — sets req.user if a valid token is present,
 * but does NOT reject the request if no token is provided.
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // ignore invalid / expired tokens for optional auth
  }
  next();
};

module.exports = { auth, authorize, optionalAuth, hasLocationAccess, getManagerLocations };
