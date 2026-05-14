-- Add 'audit' role: read-only account that can view what admin sees (no costs, no writes).
-- Re-creates the users.role CHECK constraint to include 'audit'.

SET search_path TO thehealthshop, public;

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT con.conname
    INTO cons_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
   WHERE rel.relname = 'users'
     AND ns.nspname = 'thehealthshop'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%role%admin%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE thehealthshop.users DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

ALTER TABLE thehealthshop.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'warehouse', 'branch_manager', 'branch_staff', 'audit'));
