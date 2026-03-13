-- Add batch tracking for inventory with different costs
-- This allows multiple entries per item with different unit costs

-- Add columns to track batch information
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS is_new_item BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_new_cost BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cost_batch_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS original_batch_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_cost_batch ON inventory(location_id, description, unit, cost_batch_id);

-- Update existing inventory to have batch IDs
UPDATE inventory 
SET cost_batch_id = CONCAT('BATCH-', id, '-', EXTRACT(EPOCH FROM created_at)::INTEGER)
WHERE cost_batch_id IS NULL;

-- Remove the unique constraint that prevents multiple cost batches
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;

-- Add new constraint that allows multiple batches per item
ALTER TABLE inventory 
ADD CONSTRAINT inventory_location_description_unit_batch_key 
UNIQUE (location_id, description, unit, cost_batch_id);

COMMENT ON COLUMN inventory.is_new_item IS 'Marks if this is a completely new item to the system';
COMMENT ON COLUMN inventory.is_new_cost IS 'Marks if this item has a different cost from existing batches';
COMMENT ON COLUMN inventory.cost_batch_id IS 'Unique identifier for cost batches of the same item';
COMMENT ON COLUMN inventory.original_batch_date IS 'When this cost batch was first created';