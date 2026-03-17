-- Fix inventory table constraints and foreign key issues

-- First, let's check the current inventory table structure and recreate the unique constraint
-- Drop the old constraint if it exists
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;

-- Add the correct unique constraint that matches our ON CONFLICT usage
ALTER TABLE inventory ADD CONSTRAINT inventory_location_id_description_unit_key 
UNIQUE (location_id, description, unit);

-- For the foreign key constraint issue with locations deletion,
-- we need to handle transfers that reference locations

-- Option 1: Change foreign key constraint to SET NULL on delete
-- This allows deleting locations but sets the reference to NULL
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_from_location_id_fkey;
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_to_location_id_fkey;

ALTER TABLE transfers ADD CONSTRAINT transfers_from_location_id_fkey 
FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE transfers ADD CONSTRAINT transfers_to_location_id_fkey 
FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Also fix users table foreign key constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_location_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_location_id_fkey 
FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Add indexes for better performance on the new constraints
CREATE INDEX IF NOT EXISTS idx_transfers_from_location ON transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_location ON transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_users_location_id ON users(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location_desc_unit ON inventory(location_id, description, unit);