const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function testQuery() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const client = await pool.connect();
    await client.query('SET search_path TO thehealthshop, public');
    
    console.log('Testing manager transfers query...\n');
    
    // Test 1: Check if full_name column exists
    console.log('1️⃣ Checking if full_name column exists in users table:');
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'thehealthshop' 
      AND table_name = 'users' 
      AND column_name = 'full_name'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ full_name column EXISTS');
    } else {
      console.log('❌ full_name column DOES NOT EXIST');
      console.log('   You need to run: node run-add-full-name.js');
    }
    
    // Test 2: Try the manager query with a sample array
    console.log('\n2️⃣ Testing manager query with sample location array:');
    const testLocations = [1, 2]; // Sample location IDs
    
    try {
      const result = await client.query(`
        SELECT t.*, 
               fl.name as from_location_name, 
               tl.name as to_location_name,
               u.full_name as transferred_by_name,
               au.full_name as approved_by_name,
               du.full_name as delivered_by_name
        FROM transfers t
        LEFT JOIN locations fl ON t.from_location_id = fl.id
        LEFT JOIN locations tl ON t.to_location_id = tl.id
        LEFT JOIN users u ON t.transferred_by = u.id
        LEFT JOIN users au ON t.approved_by = au.id
        LEFT JOIN users du ON t.delivered_by = du.id
        WHERE 1=1
        AND (t.from_location_id = ANY($1) OR t.to_location_id = ANY($1))
        ORDER BY t.transfer_date DESC, t.created_at DESC 
        LIMIT 5
      `, [testLocations]);
      
      console.log(`✅ Query executed successfully! Found ${result.rows.length} transfers`);
      if (result.rows.length > 0) {
        console.log('\nSample transfer:');
        console.log(result.rows[0]);
      }
    } catch (queryError) {
      console.log('❌ Query failed with error:');
      console.log(queryError.message);
    }
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testQuery();
