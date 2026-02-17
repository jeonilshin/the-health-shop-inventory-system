const pool = require('../config/database');

// Helper function to log audit events
async function logAudit({
  userId,
  username,
  action,
  tableName,
  recordId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    await pool.query(
      `INSERT INTO audit_log 
        (user_id, username, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        username,
        action,
        tableName,
        recordId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        userAgent
      ]
    );
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw error - audit logging should not break the main operation
  }
}

// Middleware to automatically log certain actions
function auditMiddleware(action, tableName) {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to log after successful response
    res.json = function(data) {
      // Only log on successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const recordId = data?.id || req.params?.id || null;
        
        logAudit({
          userId: req.user?.id,
          username: req.user?.username,
          action,
          tableName,
          recordId,
          oldValues: req.oldValues || null,
          newValues: req.body || null,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        }).catch(err => console.error('Audit log failed:', err));
      }

      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  logAudit,
  auditMiddleware
};
