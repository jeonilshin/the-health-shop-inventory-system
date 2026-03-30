-- Migration: Add 'damage' type for warehouse damage/write-off reports
-- and allow branch_location_id to be NULL (damage reports have no branch)

-- Allow branch_location_id to be NULL
ALTER TABLE delivery_discrepancies
  ALTER COLUMN branch_location_id DROP NOT NULL;

-- Replace type constraint to include 'damage'
ALTER TABLE delivery_discrepancies
  DROP CONSTRAINT IF EXISTS chk_discrepancy_type;

ALTER TABLE delivery_discrepancies
  ADD CONSTRAINT chk_discrepancy_type CHECK (type IN ('shortage', 'return', 'damage'));
