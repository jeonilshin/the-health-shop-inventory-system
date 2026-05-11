-- Create a trigger function to automatically delete inventory records when quantity reaches 0
-- This keeps the inventory clean and prevents accumulation of empty batches
-- For Supabase with thehealthshop schema

-- Set the search path to use the correct schema
SET search_path TO thehealthshop, public;

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS auto_delete_zero_inventory_trigger ON thehealthshop.inventory;
DROP FUNCTION IF EXISTS thehealthshop.auto_delete_zero_inventory();

-- Create the trigger function
CREATE OR REPLACE FUNCTION thehealthshop.auto_delete_zero_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- If quantity is 0 or less after update, delete the record
  IF NEW.quantity <= 0 THEN
    DELETE FROM thehealthshop.inventory WHERE id = NEW.id;
    -- Return NULL to prevent the UPDATE from completing (since we're deleting instead)
    RETURN NULL;
  END IF;
  
  -- Otherwise, allow the update to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger that fires BEFORE UPDATE on the inventory table
CREATE TRIGGER auto_delete_zero_inventory_trigger
  BEFORE UPDATE OF quantity ON thehealthshop.inventory
  FOR EACH ROW
  WHEN (NEW.quantity <= 0)
  EXECUTE FUNCTION thehealthshop.auto_delete_zero_inventory();

-- Test: Show current inventory with 0 quantity (these will be auto-deleted going forward)
SELECT 
  i.id,
  l.name as location_name,
  i.description,
  i.unit,
  i.quantity,
  i.expiry_date,
  i.batch_number
FROM thehealthshop.inventory i
LEFT JOIN thehealthshop.locations l ON i.location_id = l.id
WHERE i.quantity <= 0
ORDER BY i.description, i.unit;

-- Optional: Clean up existing zero-quantity records
-- Uncomment the following line to delete all existing zero-quantity inventory records
-- DELETE FROM thehealthshop.inventory WHERE quantity <= 0;
