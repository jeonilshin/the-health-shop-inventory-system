-- Improve expiry date tracking and remove cost_batch_id dependency
-- Add expiry_date as primary tracking mechanism

-- First, ensure expiry_date column exists and is properly indexed
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Create index for expiry date queries (FIFO)
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory(location_id, description, unit, expiry_date);

-- Update the unique constraint to use expiry_date instead of cost_batch_id
-- Drop old constraint if exists
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_cost_batch_id_key;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;

-- Drop the old unique index if it exists
DROP INDEX IF EXISTS idx_inventory_unique_expiry;

-- Create a new unique constraint that separates batches by expiry date
-- This allows same item with different expiry dates to be separate batches
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_unique_expiry 
ON inventory(
  location_id, 
  description, 
  unit, 
  unit_cost,
  COALESCE(expiry_date, '9999-12-31'::date)
);

COMMENT ON INDEX idx_inventory_unique_expiry IS 'Ensures each combination of location, item, cost, and expiry date is unique - allows multiple batches with different expiry dates';

-- Add expiry_date to sales table to track which batch was sold
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Add index for sales expiry tracking
CREATE INDEX IF NOT EXISTS idx_sales_expiry ON sales(expiry_date);

-- Create cost_variations table to track different cost points for same item
CREATE TABLE IF NOT EXISTS cost_variations (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  cost_point_name VARCHAR(100) NOT NULL, -- e.g., "Supplier A", "Bulk Purchase", "Regular"
  unit_cost DECIMAL(10, 2) NOT NULL,
  suggested_selling_price DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  UNIQUE(description, unit, cost_point_name)
);

-- Create index for cost variations lookup
CREATE INDEX IF NOT EXISTS idx_cost_variations_item ON cost_variations(description, unit);
CREATE INDEX IF NOT EXISTS idx_cost_variations_active ON cost_variations(is_active) WHERE is_active = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN inventory.expiry_date IS 'Expiry date for FIFO inventory management - items with earliest expiry sold first';
COMMENT ON COLUMN sales.expiry_date IS 'Expiry date of the batch that was sold';
COMMENT ON TABLE cost_variations IS 'Tracks different cost points for the same item across different suppliers or purchase conditions';
COMMENT ON COLUMN cost_variations.cost_point_name IS 'Name of the cost point (e.g., Supplier A, Bulk Purchase, Promo Price)';

-- Migrate existing data: set default expiry for items without one (far future date)
UPDATE inventory 
SET expiry_date = CURRENT_DATE + INTERVAL '5 years'
WHERE expiry_date IS NULL;

-- Create view for inventory with expiry warnings
CREATE OR REPLACE VIEW inventory_expiry_status AS
SELECT 
  i.*,
  l.name as location_name,
  CASE 
    WHEN i.expiry_date IS NULL THEN 'NO_EXPIRY'
    WHEN i.expiry_date < CURRENT_DATE THEN 'EXPIRED'
    WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'EXPIRING_3_MONTHS'
    ELSE 'GOOD'
  END as expiry_status,
  CASE 
    WHEN i.expiry_date IS NULL THEN NULL
    ELSE i.expiry_date - CURRENT_DATE
  END as days_until_expiry
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id;

COMMENT ON VIEW inventory_expiry_status IS 'Inventory with expiry status indicators for easy monitoring';
