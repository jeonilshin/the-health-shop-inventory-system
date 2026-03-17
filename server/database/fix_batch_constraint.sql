-- Fix inventory unique constraint to allow multiple cost batches
-- This migration removes the old constraint and adds the correct one

-- Drop the old constraint that prevents multiple batches
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;

-- Drop the new constraint if it exists (in case of re-run)
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_description_unit_batch_key;

-- Ensure cost_batch_id column exists and has values
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost_batch_id VARCHAR(50);

-- Update any rows that don't have a cost_batch_id
UPDATE inventory 
SET cost_batch_id = CONCAT('BATCH-', id, '-', EXTRACT(EPOCH FROM COALESCE(created_at, CURRENT_TIMESTAMP))::INTEGER)
WHERE cost_batch_id IS NULL OR cost_batch_id = '';

-- Make cost_batch_id NOT NULL after ensuring all rows have values
ALTER TABLE inventory ALTER COLUMN cost_batch_id SET NOT NULL;

-- Add the correct unique constraint that allows multiple batches per item
-- Each batch is uniquely identified by location, description, unit, AND cost_batch_id
ALTER TABLE inventory ADD CONSTRAINT inventory_location_description_unit_batch_key 
UNIQUE (location_id, description, unit, cost_batch_id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_cost_batch ON inventory(location_id, description, unit, cost_batch_id);

-- Add comment to explain the constraint
COMMENT ON CONSTRAINT inventory_location_description_unit_batch_key ON inventory IS 
'Allows multiple cost batches per item. Each batch is uniquely identified by location, description, unit, and cost_batch_id.';
