-- Add max_quantity column to track highest quantity for dynamic low stock alerts
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS max_quantity DECIMAL(10, 2) DEFAULT 0;

-- Initialize max_quantity with current quantity for existing items
UPDATE inventory 
SET max_quantity = quantity 
WHERE max_quantity = 0 OR max_quantity IS NULL;

-- Add comment
COMMENT ON COLUMN inventory.max_quantity IS 'Tracks the highest quantity ever reached for dynamic low stock calculations (30% = low, 10% = dangerous)';
