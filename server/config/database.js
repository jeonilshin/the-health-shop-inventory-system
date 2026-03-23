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
 * Get a client from the pool for transactions.
 * Always call client.release() in a finally block.
 */
const getClient = () => pool.connect();

module.exports = pool;
module.exports.getClient = getClient;
