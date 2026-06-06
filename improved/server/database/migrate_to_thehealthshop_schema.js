/**
 * Moves all new app tables from public → thehealthshop schema.
 * Old conflicting thehealthshop tables are renamed to legacy_* (data preserved).
 * PK/UNIQUE constraints (which create indices) are also renamed to avoid index name conflicts.
 * Migrated sales are truncated so sales start fresh in the new system.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TABLES_TO_RENAME = [
  'deliveries', 'delivery_discrepancies', 'delivery_items',
  'inventory', 'locations', 'manager_branches', 'notifications',
  'sales', 'sales_reports', 'stock_withdrawals',
  'transfer_items', 'transfers', 'unit_conversions', 'users',
];

const TABLES_TO_MOVE = [
  'activity_log', 'deliveries', 'delivery_discrepancies', 'delivery_items',
  'inquiries', 'inventory', 'items', 'locations', 'manager_branches',
  'notifications', 'products', 'sale_items', 'sales', 'sales_reports',
  'stock_withdrawal_items', 'stock_withdrawals', 'transfer_items',
  'transfers', 'unit_conversions', 'user_profiles', 'users',
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Step 1: Rename old thehealthshop tables + their PK/UNIQUE index names ──
    console.log('Renaming old thehealthshop tables to legacy_...');
    for (const t of TABLES_TO_RENAME) {
      await client.query(`ALTER TABLE thehealthshop.${t} RENAME TO legacy_${t}`);
      console.log(`  ${t} → legacy_${t}`);

      // Rename PK and UNIQUE constraints (they create indices; names must be unique per schema)
      const { rows: constraints } = await client.query(`
        SELECT conname
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'thehealthshop'
          AND r.relname = $1
          AND c.contype IN ('p','u')
      `, [`legacy_${t}`]);

      for (const { conname } of constraints) {
        const newName = `legacy_${conname}`;
        await client.query(
          `ALTER TABLE thehealthshop.legacy_${t} RENAME CONSTRAINT "${conname}" TO "${newName}"`
        );
        console.log(`    constraint ${conname} → ${newName}`);
      }

      // Rename standalone non-constraint indices (they are relations and must be unique per schema)
      const { rows: indices } = await client.query(`
        SELECT i.relname AS index_name
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'thehealthshop'
          AND t.relname = $1
          AND NOT EXISTS (
            SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.indexrelid
          )
      `, [`legacy_${t}`]);

      for (const { index_name } of indices) {
        const newIdx = `legacy_${index_name}`;
        await client.query(`ALTER INDEX thehealthshop."${index_name}" RENAME TO "${newIdx}"`);
        console.log(`    index ${index_name} → ${newIdx}`);
      }

      // Rename owned sequences (they conflict when public tables move to thehealthshop)
      const { rows: seqs } = await client.query(`
        SELECT s.relname AS seqname
        FROM pg_class s
        JOIN pg_namespace n ON n.oid = s.relnamespace
        JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
        JOIN pg_class tbl ON tbl.oid = d.refobjid
        WHERE s.relkind = 'S'
          AND n.nspname = 'thehealthshop'
          AND tbl.relname = $1
      `, [`legacy_${t}`]);

      for (const { seqname } of seqs) {
        const newSeq = `legacy_${seqname}`;
        await client.query(`ALTER SEQUENCE thehealthshop."${seqname}" RENAME TO "${newSeq}"`);
        console.log(`    sequence ${seqname} → ${newSeq}`);
      }
    }

    // ── Step 2: Move all public app tables → thehealthshop ─────────────────────
    console.log('\nMoving public tables to thehealthshop...');
    for (const t of TABLES_TO_MOVE) {
      await client.query(`ALTER TABLE public.${t} SET SCHEMA thehealthshop`);
      console.log(`  public.${t} → thehealthshop.${t}`);
    }

    // ── Step 3: Clear messy migrated sales ──────────────────────────────────────
    console.log('\nClearing migrated sales for a fresh start...');
    await client.query('TRUNCATE TABLE thehealthshop.sale_items CASCADE');
    await client.query('TRUNCATE TABLE thehealthshop.sales CASCADE');
    console.log('  sale_items and sales truncated');

    await client.query('COMMIT');
    console.log('\n✓ Done. thehealthshop owns all app tables. public is empty of app tables.');
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
