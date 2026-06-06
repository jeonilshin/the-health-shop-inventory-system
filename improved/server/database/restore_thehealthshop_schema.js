/**
 * Recovery script:
 * 1. Creates `improved` schema for the new app's tables
 * 2. Moves new app tables from thehealthshop → improved
 * 3. Restores original thehealthshop tables (legacy_* → original names)
 *    so the old production system keeps working
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Tables currently in thehealthshop that belong to the NEW app
// (were moved from public; have new structure)
const NEW_APP_TABLES = [
  'activity_log', 'deliveries', 'delivery_discrepancies', 'delivery_items',
  'inquiries', 'inventory', 'items', 'locations', 'manager_branches',
  'notifications', 'products', 'sale_items', 'sales', 'sales_reports',
  'stock_withdrawal_items', 'stock_withdrawals', 'transfer_items',
  'transfers', 'unit_conversions', 'user_profiles', 'users',
];

// Old thehealthshop tables currently named legacy_* that need restoring
const LEGACY_TABLES = [
  'deliveries', 'delivery_discrepancies', 'delivery_items',
  'inventory', 'locations', 'manager_branches', 'notifications',
  'sales', 'sales_reports', 'stock_withdrawals',
  'transfer_items', 'transfers', 'unit_conversions', 'users',
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Step 1: Create improved schema ──────────────────────────────────────────
    console.log('Creating improved schema...');
    await client.query('CREATE SCHEMA IF NOT EXISTS improved');

    // ── Step 2: Move new app tables from thehealthshop → improved ───────────────
    console.log('\nMoving new app tables from thehealthshop → improved...');
    for (const t of NEW_APP_TABLES) {
      await client.query(`ALTER TABLE thehealthshop.${t} SET SCHEMA improved`);
      console.log(`  thehealthshop.${t} → improved.${t}`);
    }

    // ── Step 3: Restore legacy_ tables back to original names in thehealthshop ──
    console.log('\nRestoring original thehealthshop tables from legacy_*...');
    for (const t of LEGACY_TABLES) {
      // Rename constraints + indices back (legacy_ prefix → no prefix)
      const { rows: constraints } = await client.query(`
        SELECT conname, contype FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'thehealthshop' AND r.relname = $1 AND c.contype IN ('p','u')
      `, [`legacy_${t}`]);

      for (const { conname } of constraints) {
        if (conname.startsWith('legacy_')) {
          const original = conname.slice('legacy_'.length);
          await client.query(
            `ALTER TABLE thehealthshop.legacy_${t} RENAME CONSTRAINT "${conname}" TO "${original}"`
          );
          console.log(`  constraint ${conname} → ${original}`);
        }
      }

      // Rename standalone indices back
      const { rows: indices } = await client.query(`
        SELECT i.relname AS index_name
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'thehealthshop' AND t.relname = $1
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.indexrelid)
      `, [`legacy_${t}`]);

      for (const { index_name } of indices) {
        if (index_name.startsWith('legacy_')) {
          const original = index_name.slice('legacy_'.length);
          await client.query(`ALTER INDEX thehealthshop."${index_name}" RENAME TO "${original}"`);
          console.log(`  index ${index_name} → ${original}`);
        }
      }

      // Rename sequences back
      const { rows: seqs } = await client.query(`
        SELECT s.relname AS seqname
        FROM pg_class s
        JOIN pg_namespace n ON n.oid = s.relnamespace
        JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
        JOIN pg_class tbl ON tbl.oid = d.refobjid
        WHERE s.relkind = 'S' AND n.nspname = 'thehealthshop' AND tbl.relname = $1
      `, [`legacy_${t}`]);

      for (const { seqname } of seqs) {
        if (seqname.startsWith('legacy_')) {
          const original = seqname.slice('legacy_'.length);
          await client.query(`ALTER SEQUENCE thehealthshop."${seqname}" RENAME TO "${original}"`);
          console.log(`  sequence ${seqname} → ${original}`);
        }
      }

      // Finally rename the table itself
      await client.query(`ALTER TABLE thehealthshop.legacy_${t} RENAME TO ${t}`);
      console.log(`  legacy_${t} → ${t} ✓`);
    }

    await client.query('COMMIT');
    console.log('\n✓ Done.');
    console.log('  Old system (thehealthshop schema) is fully restored.');
    console.log('  New app tables are in improved schema.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK — error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
