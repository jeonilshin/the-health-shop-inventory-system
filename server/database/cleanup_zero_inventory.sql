-- Cleanup script to remove all inventory records with zero or negative quantity
-- Run this to clean up existing zero-quantity batches

-- STEP 1: Preview what will be deleted
SELECT 
  i.id,
  l.name as location_name,
  i.description,
  i.unit,
  i.quantity,
  CASE 
    WHEN i.expiry_date IS NULL THEN 'No Expiry'
    ELSE TO_CHAR(i.expiry_date, 'YYYY-MM-DD')
  END as expiry_date,
  i.batch_number,
  i.unit_cost,
  i.suggested_selling_price
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.quantity <= 0
ORDER BY l.name, i.description, i.unit;

-- Show count by location
SELECT 
  l.name as location_name,
  COUNT(*) as zero_quantity_batches
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.quantity <= 0
GROUP BY l.name
ORDER BY COUNT(*) DESC;

-- STEP 2: Delete zero-quantity records (uncomment to execute)
-- WARNING: This will permanently delete all inventory records with quantity <= 0

/*
BEGIN;

-- Delete all inventory records with zero or negative quantity
DELETE FROM inventory WHERE quantity <= 0;

-- Show summary
SELECT 
  'Cleanup completed' as status,
  COUNT(*) as remaining_inventory_records
FROM inventory;

COMMIT;
*/
