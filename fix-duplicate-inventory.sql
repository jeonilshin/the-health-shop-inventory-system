-- Fix Duplicate Inventory from Transfers
-- This script identifies and fixes transfers where inventory was added to destination
-- but NOT deducted from source (double inventory issue)

-- Step 1: Identify problematic transfers
-- These are transfers with status 'delivered' that may have caused duplicate inventory
SELECT 
    t.id as transfer_id,
    t.description,
    t.unit,
    t.quantity,
    t.from_location_id,
    fl.name as from_location,
    t.to_location_id,
    tl.name as to_location,
    t.status,
    t.approved_at,
    t.delivered_at
FROM transfers t
LEFT JOIN locations fl ON t.from_location_id = fl.id
LEFT JOIN locations tl ON t.to_location_id = tl.id
WHERE t.status = 'delivered'
  AND t.approved_at IS NOT NULL
  AND t.delivered_at IS NOT NULL
ORDER BY t.delivered_at DESC;

-- Step 2: Check current inventory at source and destination for a specific transfer
-- Replace the values below with actual transfer details
/*
SELECT 
    i.id,
    i.location_id,
    l.name as location_name,
    i.description,
    i.unit,
    i.quantity,
    i.unit_cost
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.description = 'YOUR_ITEM_DESCRIPTION'
  AND i.unit = 'YOUR_UNIT'
  AND i.location_id IN (FROM_LOCATION_ID, TO_LOCATION_ID);
*/

-- Step 3: Manual fix for specific transfer (if inventory was NOT deducted from source)
-- IMPORTANT: Only run this if you've verified the inventory was NOT deducted!
-- Replace the values below:
/*
BEGIN;

-- Deduct from source location
UPDATE inventory 
SET quantity = quantity - TRANSFER_QUANTITY,
    updated_at = CURRENT_TIMESTAMP
WHERE location_id = FROM_LOCATION_ID
  AND description = 'ITEM_DESCRIPTION'
  AND unit = 'ITEM_UNIT'
  AND quantity >= TRANSFER_QUANTITY;

-- Verify the update
SELECT 
    i.location_id,
    l.name as location_name,
    i.description,
    i.quantity
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.description = 'ITEM_DESCRIPTION'
  AND i.unit = 'ITEM_UNIT'
  AND i.location_id IN (FROM_LOCATION_ID, TO_LOCATION_ID);

-- If everything looks correct, commit:
COMMIT;

-- If something is wrong, rollback:
-- ROLLBACK;
*/

-- Step 4: Automated fix for ALL delivered transfers (USE WITH CAUTION!)
-- This will attempt to deduct inventory for all delivered transfers
-- Only use if you're sure ALL delivered transfers have this issue
/*
DO $$
DECLARE
    transfer_record RECORD;
    inventory_record RECORD;
    remaining_qty NUMERIC;
BEGIN
    -- Loop through all delivered transfers
    FOR transfer_record IN 
        SELECT * FROM transfers 
        WHERE status = 'delivered' 
          AND approved_at > '2026-04-23'  -- Only recent transfers
        ORDER BY approved_at ASC
    LOOP
        RAISE NOTICE 'Processing transfer ID: %, Item: %, Qty: %', 
            transfer_record.id, 
            transfer_record.description, 
            transfer_record.quantity;
        
        -- Check if inventory exists at source
        SELECT * INTO inventory_record
        FROM inventory
        WHERE location_id = transfer_record.from_location_id
          AND description = transfer_record.description
          AND unit = transfer_record.unit
        LIMIT 1;
        
        IF FOUND THEN
            -- Deduct from source (FIFO)
            remaining_qty := transfer_record.quantity;
            
            FOR inventory_record IN
                SELECT * FROM inventory
                WHERE location_id = transfer_record.from_location_id
                  AND description = transfer_record.description
                  AND unit = transfer_record.unit
                  AND quantity > 0
                ORDER BY created_at ASC
            LOOP
                IF remaining_qty <= 0 THEN
                    EXIT;
                END IF;
                
                IF inventory_record.quantity >= remaining_qty THEN
                    -- This batch has enough
                    UPDATE inventory 
                    SET quantity = quantity - remaining_qty,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = inventory_record.id;
                    
                    RAISE NOTICE '  Deducted % from batch ID %', remaining_qty, inventory_record.id;
                    remaining_qty := 0;
                ELSE
                    -- Deduct all from this batch and continue
                    UPDATE inventory 
                    SET quantity = 0,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = inventory_record.id;
                    
                    RAISE NOTICE '  Deducted % from batch ID % (emptied)', inventory_record.quantity, inventory_record.id;
                    remaining_qty := remaining_qty - inventory_record.quantity;
                END IF;
            END LOOP;
            
            IF remaining_qty > 0 THEN
                RAISE WARNING '  Could not deduct full quantity! Remaining: %', remaining_qty;
            END IF;
        ELSE
            RAISE WARNING '  Item not found at source location!';
        END IF;
    END LOOP;
END $$;
*/

-- Step 5: Verification query - Check inventory totals before and after
SELECT 
    l.name as location,
    i.description,
    i.unit,
    SUM(i.quantity) as total_quantity,
    COUNT(*) as batch_count
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
GROUP BY l.name, i.description, i.unit
ORDER BY l.name, i.description;
