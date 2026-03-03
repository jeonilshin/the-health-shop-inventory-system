-- Add category columns to inventory table for hierarchical categorization
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS main_category VARCHAR(255),
ADD COLUMN IF NOT EXISTS sub_category VARCHAR(255);

-- Create indexes for category filtering
CREATE INDEX IF NOT EXISTS idx_inventory_main_category ON inventory(main_category);
CREATE INDEX IF NOT EXISTS idx_inventory_sub_category ON inventory(sub_category);
CREATE INDEX IF NOT EXISTS idx_inventory_categories ON inventory(main_category, sub_category);
