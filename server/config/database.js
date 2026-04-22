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

// Set search_path on every new connection
pool.on('connect', async (client) => {
  try {
    // Set the schema search path for this connection
    await client.query("SET search_path TO thehealthshop, public");
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DB] Schema search_path set to: thehealthshop, public');
    }
  } catch (err) {
    console.error('[DB] Error setting search_path:', err.message);
  }
});

// Log pool errors (unhandled errors from idle clients)
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * Get a client from the pool for transactions.
 * Always call client.release() in a finally block.
 */
const getClient = () => pool.connect();

module.exports = pool;
module.exports.getClient = getClient;
