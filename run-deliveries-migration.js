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

    // Reservation model columns (reserve warehouse stock at send, add to branch at receive)
    console.log('Adding reservation columns...');

    await client.query(`
      ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS reserved_batches JSONB
    `);
    await client.query(`
      ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN DEFAULT FALSE
    `);

    console.log('✓ Reservation columns added (delivery_items.reserved_batches, deliveries.stock_reserved)');

    // Fix the trigger function
    console.log('Fixing manager action trigger...');
    
    await client.query(`DROP TRIGGER IF EXISTS trigger_log_delivery_manager_actions ON deliveries`);
    await client.query(`DROP TRIGGER IF EXISTS trigger_log_transfer_manager_actions ON transfers`);
    await client.query(`DROP FUNCTION IF EXISTS log_manager_action()`);
    
    await client.query(`
      CREATE OR REPLACE FUNCTION log_manager_action()
      RETURNS TRIGGER AS $$
      DECLARE
        o jsonb := to_jsonb(OLD);
        n jsonb := to_jsonb(NEW);
      BEGIN
        -- One shared function serves both tables. Reading fields through jsonb means
        -- a column that only exists on the OTHER table returns NULL instead of raising
        -- "record old has no field ..." (transfers has manager_approved_by, deliveries
        -- has manager_confirmed_by — neither has the other's column).

        -- Log transfer approvals
        IF TG_TABLE_NAME = 'transfers'
           AND (o->>'manager_approved_by') IS NULL
           AND (n->>'manager_approved_by') IS NOT NULL THEN
          INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
          VALUES ((n->>'manager_approved_by')::int, 'approve_transfer', 'transfer', (n->>'id')::int, (n->>'to_location_id')::int, 'Transfer approved by manager');
        END IF;

        -- Log delivery confirmations
        IF TG_TABLE_NAME = 'deliveries'
           AND (o->>'manager_confirmed_by') IS NULL
           AND (n->>'manager_confirmed_by') IS NOT NULL THEN
          INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
          VALUES ((n->>'manager_confirmed_by')::int, 'confirm_delivery', 'delivery', (n->>'id')::int, (n->>'to_location_id')::int, 'Delivery confirmed by manager');
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
