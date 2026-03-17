const pool = require('./server/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'server/database/fix_batch_constraint.sql'),
      'utf8'
    );
    
    console.log('🔄 Running migration to fix batch constraint...');
    console.log('');
    
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Changes applied:');
    console.log('  ✓ Removed old unique constraint (location_id, description, unit)');
    console.log('  ✓ Added new unique constraint (location_id, description, unit, cost_batch_id)');
    console.log('  ✓ Updated rows with missing cost_batch_id');
    console.log('  ✓ Created performance index');
    console.log('');
    console.log('You can now import items with different costs!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
