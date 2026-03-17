-- Add batch tracking columns to transfer_items table
-- Run this migration to add batch tracking support to transfers

ALTER TABLE transfer_items 
ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS expiry_date DATE,
ADD COLUMN IF NOT EXISTS is_new_item BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_new_cost BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cost_batch_id INTEGER,
ADD COLUMN IF NOT EXISTS original_batch_date TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transfer_items_batch ON transfer_items(batch_number);
CREATE INDEX IF NOT EXISTS idx_transfer_items_cost_batch ON transfer_items(cost_batch_id);

-- Update existing transfer_items with batch information from inventory where possible
-- This is a best-effort migration - some data may not be perfectly matched
UPDATE transfer_items ti
SET 
  batch_number = i.batch_number,
  expiry_date = i.expiry_date,
  is_new_item = COALESCE(i.is_new_item, FALSE),
  is_new_cost = COALESCE(i.is_new_cost, FALSE),
  cost_batch_id = i.cost_batch_id,
  original_batch_date = i.original_batch_date
FROM inventory i
WHERE ti.description = i.description 
  AND ti.unit = i.unit 
  AND ti.unit_cost = i.unit_cost
  AND ti.batch_number IS NULL;

-- Note: After running this migration, the unreceive functionality will work properly
-- with batch tracking information preserved during transfer operations.