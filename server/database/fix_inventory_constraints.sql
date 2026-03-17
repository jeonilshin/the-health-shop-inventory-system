-- Fix inventory table constraints and foreign key issues

-- First, let's check the current inventory table structure and recreate the unique constraint
-- Drop the old constraint if it exists
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_description_unit_batch_key;

-- Add the correct unique constraint that allows multiple cost batches per item
-- This constraint includes cost_batch_id to allow multiple batches with different costs
ALTER TABLE inventory ADD CONSTRAINT inventory_location_description_unit_batch_key 
UNIQUE (location_id, description, unit, cost_batch_id);

-- For the foreign key constraint issue with locations deletion,
-- we need to handle ALL tables that reference locations

-- Fix transfers table foreign key constraints
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_from_location_id_fkey;
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_to_location_id_fkey;

ALTER TABLE transfers ADD CONSTRAINT transfers_from_location_id_fkey 
FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE transfers ADD CONSTRAINT transfers_to_location_id_fkey 
FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Fix users table foreign key constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_location_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_location_id_fkey 
FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Fix deliveries table foreign key constraints
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_from_location_id_fkey;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_to_location_id_fkey;

ALTER TABLE deliveries ADD CONSTRAINT deliveries_from_location_id_fkey 
FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE deliveries ADD CONSTRAINT deliveries_to_location_id_fkey 
FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Fix sales_transactions table foreign key constraint
ALTER TABLE sales_transactions DROP CONSTRAINT IF EXISTS sales_transactions_location_id_fkey;
ALTER TABLE sales_transactions ADD CONSTRAINT sales_transactions_location_id_fkey 
FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Fix inventory table foreign key constraint
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_fkey;
ALTER TABLE inventory ADD CONSTRAINT inventory_location_id_fkey 
FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Add indexes for better performance on the new constraints
CREATE INDEX IF NOT EXISTS idx_transfers_from_location ON transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_location ON transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_users_location_id ON users(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location_desc_unit ON inventory(location_id, description, unit);
CREATE INDEX IF NOT EXISTS idx_deliveries_from_location ON deliveries(from_location_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_to_location ON deliveries(to_location_id);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_location ON sales_transactions(location_id);