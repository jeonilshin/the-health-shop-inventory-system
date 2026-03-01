-- Unit Conversions Table
-- Allows tracking of unit relationships (e.g., 1 box = 50 packs)
CREATE TABLE IF NOT EXISTS unit_conversions (
  id SERIAL PRIMARY KEY,
  product_description TEXT NOT NULL,
  base_unit VARCHAR(50) NOT NULL,  -- e.g., "box"
  converted_unit VARCHAR(50) NOT NULL,  -- e.g., "pack"
  conversion_factor DECIMAL(10, 2) NOT NULL,  -- e.g., 50 (1 box = 50 packs)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_description, base_unit, converted_unit)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_unit_conversions_product ON unit_conversions(product_description);
CREATE INDEX IF NOT EXISTS idx_unit_conversions_base_unit ON unit_conversions(base_unit);

-- Example data
-- INSERT INTO unit_conversions (product_description, base_unit, converted_unit, conversion_factor)
-- VALUES 
--   ('Paracetamol', 'box', 'pack', 50),
--   ('Paracetamol', 'pack', 'piece', 10),
--   ('Vitamin C', 'box', 'bottle', 24);

-- Add conversion tracking to inventory
-- This allows us to track items in multiple units simultaneously
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS base_unit VARCHAR(50);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS base_quantity DECIMAL(10, 2);

-- Add conversion tracking to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS conversion_used BOOLEAN DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS original_unit VARCHAR(50);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS original_quantity DECIMAL(10, 2);

-- Add conversion tracking to transfers
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS conversion_used BOOLEAN DEFAULT FALSE;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS original_unit VARCHAR(50);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS original_quantity DECIMAL(10, 2);

COMMENT ON TABLE unit_conversions IS 'Stores unit conversion relationships for products (e.g., 1 box = 50 packs)';
COMMENT ON COLUMN unit_conversions.conversion_factor IS 'How many converted_units are in one base_unit';
