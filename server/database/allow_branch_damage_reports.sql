-- Migration: allow branches to file standalone damage reports
-- Until now warehouse_location_id was NOT NULL because every report had a
-- warehouse counterpart. Branch staff who break a bottle while sorting need
-- to file a damage write-off against the branch alone with no warehouse
-- involved, so we relax the column to nullable. Existing data is unchanged.
--
-- PREREQUISITE: the delivery_discrepancies table must already exist. If it
-- does not, run server/database/delivery_discrepancies.sql first (followed by
-- fix_discrepancies_table.sql and add_damage_type_to_discrepancies.sql) to
-- bring the table up to the expected schema.
--
-- This migration is wrapped in a DO block so it no-ops gracefully on a
-- database where the table has not yet been created.
--
-- The app uses the `thehealthshop` schema (see server/config/database.js
-- which SETs search_path on every connection). When running this in the
-- Supabase SQL editor the default search_path is `public`, so we set it
-- explicitly here to match the app's expectation.

SET search_path TO thehealthshop, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'thehealthshop'
      AND table_name   = 'delivery_discrepancies'
  ) THEN
    ALTER TABLE thehealthshop.delivery_discrepancies
      ALTER COLUMN warehouse_location_id DROP NOT NULL;
    RAISE NOTICE 'thehealthshop.delivery_discrepancies.warehouse_location_id is now nullable.';
  ELSE
    RAISE NOTICE 'thehealthshop.delivery_discrepancies does not exist — skipping. Run delivery_discrepancies.sql first.';
  END IF;
END$$;
