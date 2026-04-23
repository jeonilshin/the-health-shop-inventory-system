const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();
    
    // Set search path to custom schema
    await client.query('SET search_path TO thehealthshop, public');
    console.log('✅ Connected to database (schema: thehealthshop)');

    // Read and execute the migration
    console.log('🔄 Running migration: add-full-name-column.sql');
    const sql = fs.readFileSync('add-full-name-column.sql', 'utf8');
    
    const result = await client.query(sql);
    console.log('✅ Migration completed successfully!');
    
    // Show the result
    if (result.rows && result.rows.length > 0) {
      console.log('\n📋 Column details:');
      console.table(result.rows);
    }

    // Verify by checking a sample user
    const userCheck = await client.query('SELECT id, username, full_name FROM users LIMIT 5');
    console.log('\n📋 Sample users:');
    console.table(userCheck.rows);

    client.release();
    await pool.end();
    
    console.log('\n✅ All done! The full_name column has been added to the users table.');
    console.log('💡 Tip: You can now update user full names in the Admin panel.');
    
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runMigration();
