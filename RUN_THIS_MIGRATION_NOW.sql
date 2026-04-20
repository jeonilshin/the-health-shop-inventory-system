-- ============================================
-- RUN THIS ENTIRE FILE IN YOUR DATABASE NOW
-- ============================================

-- Step 1: Fix the unique constraint to separate by expiry date
-- ============================================

-- Drop old constraints
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_cost_batch_id_key;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;
DROP INDEX IF EXISTS idx_inventory_unique_expiry;

-- Create new constraint that separates by expiry date
CREATE UNIQUE INDEX idx_inventory_unique_expiry 
ON inventory(
  location_id, 
  description, 
  unit, 
  unit_cost,
  COALESCE(expiry_date, '9999-12-31'::date)
);

COMMENT ON INDEX idx_inventory_unique_expiry IS 'Ensures each combination of location, item, cost, and expiry date is unique - allows multiple batches with different expiry dates';

-- Step 2: Add expiry_date column to sales table
-- ============================================

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_sales_expiry ON sales(expiry_date);

-- Step 3: Create cost_variations table
-- ============================================

CREATE TABLE IF NOT EXISTS cost_variations (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  cost_point_name VARCHAR(100) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  suggested_selling_price DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  UNIQUE(description, unit, cost_point_name)
);

CREATE INDEX IF NOT EXISTS idx_cost_variations_item ON cost_variations(description, unit);
CREATE INDEX IF NOT EXISTS idx_cost_variations_active ON cost_variations(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE cost_variations IS 'Tracks different cost points for the same item across different suppliers or purchase conditions';
COMMENT ON COLUMN cost_variations.cost_point_name IS 'Name of the cost point (e.g., Supplier A, Bulk Purchase, Promo Price)';

-- Step 4: Create inventory expiry status view
-- ============================================

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

-- Step 5: Fix your TEST item data
-- ============================================

-- Delete the merged TEST item
DELETE FROM inventory WHERE description = 'TEST';

-- You'll need to re-add through the UI:
-- 1. Add TEST, 12 qty, expiry 06/22/2026
-- 2. Add TEST, 2 qty, expiry 06/23/2026  
-- 3. Add TEST, 2 qty, expiry 06/24/2026

-- Step 6: Verify the changes
-- ============================================

-- Check if the index was created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'inventory' 
AND indexname = 'idx_inventory_unique_expiry';

-- Check if cost_variations table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'cost_variations';

-- Check if expiry_date column exists in sales
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sales' 
AND column_name = 'expiry_date';

-- Done!
SELECT 'Migration completed successfully!' as status;
