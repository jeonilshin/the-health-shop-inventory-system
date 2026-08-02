-- ============================================================================
--  RESET TRANSACTIONAL DATA  —  KEEP ACCOUNTS + LOCATIONS + CONFIG
-- ============================================================================
--  Wipes ALL operational data (inventory, deliveries, transfers, sales,
--  discrepancies, audit logs, notifications, messages, withdrawals, counts,
--  cost variations, …) and resets their id counters to 1.
--
--  KEEPS the tables in `keep_tables` below:
--    users              - login accounts
--    locations          - branches / warehouses
--    manager_branches   - which branches each manager oversees
--    unit_conversions   - product unit ratios (e.g. 1 BOT = 22 PC)
--
--  ⚠️  THIS IS DESTRUCTIVE AND CANNOT BE UNDONE. Take a backup first.
--      It runs inside a transaction: if anything looks wrong you can ROLLBACK
--      instead of COMMIT when running it interactively.
--
--  HOW TO RUN (from the project root, against your real DB):
--     DOTENV_CONFIG_PATH=.env.local node -r dotenv/config -e "
--       const {Pool}=require('pg'); const fs=require('fs');
--       const pool=new Pool({connectionString:process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
--       (async()=>{ await pool.query(fs.readFileSync('server/database/reset_data_keep_accounts.sql','utf8'));
--                   console.log('✅ Data reset complete'); await pool.end(); })()
--                 .catch(e=>{console.error(e.message);process.exit(1);});"
--
--  …or paste this whole file into the Supabase SQL editor and run it.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- Edit this list if you want to preserve additional tables.
  keep_tables text[] := ARRAY[
    'users',
    'locations',
    'manager_branches',
    'unit_conversions'
  ];
  target_list text;
BEGIN
  -- Build a comma-separated, schema-qualified list of every table to wipe.
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO target_list
  FROM pg_tables
  WHERE schemaname = 'thehealthshop'
    AND tablename <> ALL (keep_tables);

  IF target_list IS NULL THEN
    RAISE NOTICE 'Nothing to wipe — no matching tables found.';
  ELSE
    RAISE NOTICE 'Wiping: %', target_list;
    -- One TRUNCATE handles FK ordering; CASCADE covers child tables,
    -- RESTART IDENTITY resets serial id counters back to 1.
    EXECUTE 'TRUNCATE TABLE ' || target_list || ' RESTART IDENTITY CASCADE';
    RAISE NOTICE '✅ All transactional data cleared. Accounts, locations, and config kept.';
  END IF;
END $$;

-- Review the RAISE NOTICE output above, then keep the data reset:
COMMIT;
-- (Run ROLLBACK; instead of COMMIT; if you ran this interactively and changed your mind.)
