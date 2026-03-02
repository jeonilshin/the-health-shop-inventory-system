-- Add batch_number column to inventory table
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50);

-- Create index for batch_number lookups
CREATE INDEX IF NOT EXISTS idx_inventory_batch_number ON inventory(batch_number);
