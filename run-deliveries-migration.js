require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Starting deliveries table migration...');
    
    // Set search path
    await client.query("SET search_path TO thehealthshop, public");
    console.log('✓ Search path set to thehealthshop');
    
    // Add manager approval columns to deliveries
    console.log('Adding manager approval columns to deliveries table...');
    
    // Add requires_manager_approval
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'deliveries' 
          AND column_name = 'requires_manager_approval'
        ) THEN
          ALTER TABLE deliveries ADD COLUMN requires_manager_approval BOOLEAN DEFAULT FALSE;
          RAISE NOTICE 'Added requires_manager_approval column';
        END IF;
      END $$;
    `);
    
    // Add manager_confirmed_by
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'deliveries' 
          AND column_name = 'manager_confirmed_by'
        ) THEN
          ALTER TABLE deliveries ADD COLUMN manager_confirmed_by INTEGER REFERENCES users(id);
          RAISE NOTICE 'Added manager_confirmed_by column';
        END IF;
      END $$;
    `);
    
    // Add manager_confirmed_at
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'deliveries' 
          AND column_name = 'manager_confirmed_at'
        ) THEN
          ALTER TABLE deliveries ADD COLUMN manager_confirmed_at TIMESTAMP;
          RAISE NOTICE 'Added manager_confirmed_at column';
        END IF;
      END $$;
    `);
    
    console.log('✓ Manager approval columns added');
    
    // Fix the trigger function
    console.log('Fixing manager action trigger...');
    
    await client.query(`DROP TRIGGER IF EXISTS trigger_log_delivery_manager_actions ON deliveries`);
    await client.query(`DROP TRIGGER IF EXISTS trigger_log_transfer_manager_actions ON transfers`);
    await client.query(`DROP FUNCTION IF EXISTS log_manager_action()`);
    
    await client.query(`
      CREATE OR REPLACE FUNCTION log_manager_action()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Log transfer approvals
        IF TG_TABLE_NAME = 'transfers' AND OLD.manager_approved_by IS NULL AND NEW.manager_approved_by IS NOT NULL THEN
          INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
          VALUES (NEW.manager_approved_by, 'approve_transfer', 'transfer', NEW.id, NEW.to_location_id, 'Transfer approved by manager');
        END IF;
        
        -- Log delivery confirmations (use manager_confirmed_by, not manager_approved_by)
        IF TG_TABLE_NAME = 'deliveries' AND OLD.manager_confirmed_by IS NULL AND NEW.manager_confirmed_by IS NOT NULL THEN
          INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
          VALUES (NEW.manager_confirmed_by, 'confirm_delivery', 'delivery', NEW.id, NEW.to_location_id, 'Delivery confirmed by manager');
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await client.query(`
      CREATE TRIGGER trigger_log_transfer_manager_actions
        AFTER UPDATE ON transfers
        FOR EACH ROW
        EXECUTE FUNCTION log_manager_action()
    `);
    
    await client.query(`
      CREATE TRIGGER trigger_log_delivery_manager_actions
        AFTER UPDATE ON deliveries
        FOR EACH ROW
        EXECUTE FUNCTION log_manager_action()
    `);
    
    console.log('✓ Manager action trigger fixed');
    
    // Verify columns exist
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'deliveries' 
      AND column_name IN ('requires_manager_approval', 'manager_confirmed_by', 'manager_confirmed_at')
      ORDER BY column_name
    `);
    
    console.log('✓ Verified columns:', result.rows.map(r => r.column_name).join(', '));
    
    console.log('✅ Migration completed successfully!');
    console.log('Staff can now accept deliveries without errors.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
