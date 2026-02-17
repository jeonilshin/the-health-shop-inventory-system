-- Add unit_cost to delivery_items if it doesn't exist
ALTER TABLE delivery_items 
ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);

-- Update existing delivery_items to have unit_cost from inventory
UPDATE delivery_items di
SET unit_cost = (
  SELECT i.unit_cost 
  FROM inventory i
  JOIN deliveries d ON di.delivery_id = d.id
  WHERE i.location_id = d.from_location_id 
    AND i.description = di.description 
    AND i.unit = di.unit
  LIMIT 1
)
WHERE di.unit_cost IS NULL;
