-- Fix delivery_discrepancies table
-- Run this migration to add missing columns and update constraints

-- Step 1: Add timestamp columns if they don't exist
ALTER TABLE delivery_discrepancies 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE delivery_discrepancies 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Update existing rows to have timestamps if they're null
UPDATE delivery_discrepancies 
SET created_at = reported_at 
WHERE created_at IS NULL;

UPDATE delivery_discrepancies 
SET updated_at = COALESCE(resolved_at, reported_at, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;

-- Step 3: Drop old constraint
ALTER TABLE delivery_discrepancies 
DROP CONSTRAINT IF EXISTS chk_discrepancy_status;

-- Step 4: Add new constraint with 'completed' status
ALTER TABLE delivery_discrepancies 
ADD CONSTRAINT chk_discrepancy_status 
CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

-- Step 5: Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_discrepancy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_discrepancy_timestamp ON delivery_discrepancies;

CREATE TRIGGER trigger_update_discrepancy_timestamp
BEFORE UPDATE ON delivery_discrepancies
FOR EACH ROW
EXECUTE FUNCTION update_discrepancy_updated_at();

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'delivery_discrepancies'
ORDER BY ordinal_position;
