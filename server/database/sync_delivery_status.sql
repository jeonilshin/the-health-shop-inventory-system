-- Migration: Sync Delivery Status with Transfer Status
-- This fixes deliveries that are still showing as 'in_transit' or 'admin_confirmed'
-- when their linked transfer has already been marked as 'delivered'

-- Update deliveries to 'delivered' if their linked transfer is already delivered
UPDATE deliveries d
SET 
  status = 'delivered',
  delivered_date = t.delivered_at,
  updated_at = CURRENT_TIMESTAMP
FROM transfers t
WHERE d.transfer_id = t.id
  AND t.status = 'delivered'
  AND d.status IN ('in_transit', 'admin_confirmed', 'awaiting_admin')
  AND d.transfer_id IS NOT NULL;

-- Show what was updated
SELECT 
  d.id as delivery_id,
  d.status as delivery_status,
  t.id as transfer_id,
  t.status as transfer_status,
  t.description,
  t.quantity,
  t.unit,
  t.delivered_at
FROM deliveries d
JOIN transfers t ON d.transfer_id = t.id
WHERE t.status = 'delivered'
ORDER BY t.delivered_at DESC;
