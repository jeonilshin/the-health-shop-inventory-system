# Fix Expiry Batches - Quick Guide

## Problem
Your inventory is merging items with different expiry dates into one batch. This is because the unique constraint wasn't properly set up.

## Solution

### Step 1: Run This SQL to Fix the Constraint

```sql
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
```

### Step 2: Fix Your Existing TEST Item

Your TEST item with 55 quantity needs to be split into two batches:

```sql
-- First, check what you have
SELECT id, description, unit, quantity, expiry_date, unit_cost 
FROM inventory 
WHERE description = 'TEST';

-- If you see one row with 55 quantity and expiry 06/22/2026, we need to split it

-- Option A: Delete and re-add correctly
DELETE FROM inventory WHERE description = 'TEST';

-- Then add them separately through the UI:
-- 1. Add TEST, 22 quantity, expiry 06/21/2026
-- 2. Add TEST, 33 quantity, expiry 06/22/2026

-- Option B: Manual SQL split (if you want to keep the data)
-- Update the existing one to have 22 quantity with 06/21/2026
UPDATE inventory 
SET quantity = 22, 
    expiry_date = '2026-06-21'
WHERE description = 'TEST';

-- Insert the second batch with 33 quantity and 06/22/2026
INSERT INTO inventory 
  (location_id, description, unit, quantity, unit_cost, suggested_selling_price, 
   expiry_date, batch_number, max_quantity, cost_batch_id)
SELECT 
  location_id, 
  description, 
  unit, 
  33, -- new quantity
  unit_cost, 
  suggested_selling_price,
  '2026-06-22', -- new expiry
  batch_number,
  33, -- max_quantity
  'BATCH-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 9)
FROM inventory 
WHERE description = 'TEST'
LIMIT 1;
```

### Step 3: Restart Your Server

```bash
# Stop your server (Ctrl+C)
# Then restart
npm run dev
```

### Step 4: Test

1. Go to Inventory page
2. Add a new item with expiry date 06/21/2026
3. Add same item again with expiry date 06/22/2026
4. You should now see TWO separate batches!

## Why This Happened

The old unique constraint was:
```sql
UNIQUE(location_id, description, unit, cost_batch_id)
```

This allowed multiple expiry dates for the same item because `cost_batch_id` was different.

The new constraint is:
```sql
UNIQUE(location_id, description, unit, unit_cost, expiry_date)
```

This ensures each combination of location + item + cost + expiry is unique, so:
- Same item, same cost, DIFFERENT expiry = 2 separate batches ✅
- Same item, same cost, SAME expiry = 1 batch (quantities add up) ✅

## Quick SQL Commands

### Run the migration:
```bash
psql -U your_username -d your_database -f server/database/improve_expiry_tracking.sql
```

### Or copy-paste this into your database:
```sql
-- Fix the constraint
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_cost_batch_id_key;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;
DROP INDEX IF EXISTS idx_inventory_unique_expiry;

CREATE UNIQUE INDEX idx_inventory_unique_expiry 
ON inventory(
  location_id, 
  description, 
  unit, 
  unit_cost,
  COALESCE(expiry_date, '9999-12-31'::date)
);

-- Verify it worked
\d inventory
```

You should see the new index `idx_inventory_unique_expiry` in the list.

## After Fixing

Now when you add inventory:
- **Same expiry date** → Adds to existing batch
- **Different expiry date** → Creates new batch

Example:
```
Add: TEST, 22 qty, expiry 06/21/2026 → Batch 1 created
Add: TEST, 10 qty, expiry 06/21/2026 → Batch 1 now has 32 qty
Add: TEST, 33 qty, expiry 06/22/2026 → Batch 2 created (different expiry!)
```

Result:
```
Batch 1: 32 qty, expires 06/21/2026
Batch 2: 33 qty, expires 06/22/2026
```
