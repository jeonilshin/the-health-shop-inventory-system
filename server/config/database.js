const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool tuning
  max: 20,                    // maximum pool size
  min: 2,                     // keep at least 2 connections alive
  idleTimeoutMillis: 30000,   // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if no connection available in 5s
  // Keep connections alive (important for cloud databases)
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
});

// Log pool errors (unhandled errors from idle clients)
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

// Optional: log when the pool connects for the first time
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    // Only log first connection to avoid noise
  }
});

/**
 * Run a query with automatic client release.
 * Usage: await query('SELECT $1::text', ['hello'])
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DB_LOG_QUERIES === 'true') {
      console.log('[DB]', { duration: `${duration}ms`, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message);
    throw err;
  }
};

/**
 * Get a client from the pool for transactions.
 * Always call client.release() in a finally block.
 */
const getClient = () => pool.connect();

module.exports = pool;
module.exports.query = query;
module.exports.getClient = getClient;
