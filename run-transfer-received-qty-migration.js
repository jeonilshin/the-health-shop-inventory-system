const fs = require('fs');
const path = require('path');

// Load env the same way the app does, preferring .env.local (where the local
// DATABASE_URL lives) and falling back to .env.
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
require('dotenv').config();

const pool = require('./server/config/database');

async function runMigration() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'server/database/add_transfer_received_quantity.sql'),
      'utf8'
    );

    console.log('🔄 Adding received_quantity column to transfers...');
    await client.query(sql);
    console.log('✅ Migration completed. Transfers now track actual received quantity.');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
