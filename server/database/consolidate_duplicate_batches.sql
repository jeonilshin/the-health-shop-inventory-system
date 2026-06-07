-- Consolidate duplicate inventory batches
-- This script merges batches that have the same location, description, unit, cost, price, and expiry date
-- For Supabase with thehealthshop schema

-- Set the search path to use the correct schema
SET search_path TO thehealthshop, public;

-- STEP 1: Preview what will be consolidated (COMMENT THIS OUT WHEN RUNNING STEP 2)
/*
SELECT 
  i.location_id,
  l.name as location_name,
  i.description,
  i.unit,
  i.unit_cost,
  COALESCE(i.suggested_selling_price, 0) as suggested_selling_price,
  CASE 
    WHEN i.expiry_date IS NULL THEN 'No Expiry'
    ELSE TO_CHAR(i.expiry_date, 'YYYY-MM-DD')
  END as expiry_date,
  COUNT(*) as duplicate_batch_count,
  STRING_AGG(i.id::text, ', ' ORDER BY i.id) as batch_ids,
  STRING_AGG(i.quantity::text, ' + ' ORDER BY i.id) as quantities,
  SUM(i.quantity) as total_quantity
FROM thehealthshop.inventory i
LEFT JOIN thehealthshop.locations l ON i.location_id = l.id
GROUP BY 
  i.location_id, 
  l.name,
  i.description, 
  i.unit, 
  i.unit_cost, 
  COALESCE(i.suggested_selling_price, 0),
  i.expiry_date
HAVING COUNT(*) > 1  -- Only show groups with duplicates
ORDER BY i.description, i.unit, i.location_id;
*/

-- STEP 2: Consolidate duplicate batches (UNCOMMENT THIS TO EXECUTE)
-- WARNING: This will permanently merge duplicate batches!
-- To execute: Remove the -- /* on line 42 and the -- */ on line 133

-- /*
BEGIN;

-- Update the oldest batch with the total quantity
WITH duplicate_batches AS (
  SELECT 
    location_id,
    description,
    unit,
    unit_cost,
    COALESCE(suggested_selling_price, 0) as suggested_selling_price,
    expiry_date,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY id) as all_ids,
    SUM(quantity) as total_quantity,
    MAX(max_quantity) as max_max_quantity
  FROM thehealthshop.inventory
  GROUP BY 
    location_id, 
    description, 
    unit, 
    unit_cost, 
    COALESCE(suggested_selling_price, 0),
    expiry_date
  HAVING COUNT(*) > 1
)
UPDATE thehealthshop.inventory i
SET 
  quantity = db.total_quantity,
  max_quantity = GREATEST(i.max_quantity, db.max_max_quantity),
  updated_at = CURRENT_TIMESTAMP
FROM duplicate_batches db
WHERE i.id = db.keep_id;

-- Delete the duplicate batches (keeping only the oldest one)
WITH duplicate_batches AS (
  SELECT 
    location_id,
    description,
    unit,
    unit_cost,
    COALESCE(suggested_selling_price, 0) as suggested_selling_price,
    expiry_date,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY id) as all_ids
  FROM thehealthshop.inventory
  GROUP BY 
    location_id, 
    description, 
    unit, 
    unit_cost, 
    COALESCE(suggested_selling_price, 0),
    expiry_date
  HAVING COUNT(*) > 1
),
batches_to_delete AS (
  SELECT UNNEST(all_ids[2:array_length(all_ids, 1)]) as delete_id
  FROM duplicate_batches
)
DELETE FROM thehealthshop.inventory
WHERE id IN (SELECT delete_id FROM batches_to_delete);

COMMIT;

-- Show summary after consolidation
SELECT 
  l.name as location_name,
  i.description,
  i.unit,
  i.unit_cost,
  i.suggested_selling_price,
  CASE 
    WHEN i.expiry_date IS NULL THEN 'No Expiry'
    ELSE TO_CHAR(i.expiry_date, 'YYYY-MM-DD')
  END as expiry_date,
  COUNT(*) as batch_count,
  SUM(i.quantity) as total_quantity
FROM thehealthshop.inventory i
LEFT JOIN thehealthshop.locations l ON i.location_id = l.id
GROUP BY 
  l.name,
  i.location_id, 
  i.description, 
  i.unit, 
  i.unit_cost, 
  i.suggested_selling_price,
  i.expiry_date
ORDER BY i.description, i.unit;
-- */
