# Step-by-Step Fix Guide

## Problem
- Inventory is merging batches with different expiry dates
- Costs page is empty (table doesn't exist yet)

## Solution - Follow These Steps EXACTLY

### Step 1: Run the Migration

**Option A - Using psql command line:**
```bash
psql -U your_username -d your_database -f RUN_THIS_MIGRATION_NOW.sql
```

**Option B - Using pgAdmin or database GUI:**
1. Open pgAdmin (or your database tool)
2. Connect to your database
3. Open a new SQL query window
4. Copy ALL the content from `RUN_THIS_MIGRATION_NOW.sql`
5. Paste it into the query window
6. Click "Execute" or press F5

**Option C - Copy this SQL directly:**
```sql
-- Drop old constraints
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_cost_batch_id_key;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;
DROP INDEX IF EXISTS idx_inventory_unique_expiry;

-- Create new constraint
CREATE UNIQUE INDEX idx_inventory_unique_expiry 
ON inventory(location_id, description, unit, unit_cost, COALESCE(expiry_date, '9999-12-31'::date));

-- Add expiry to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Create cost_variations table
CREATE TABLE IF NOT EXISTS cost_variations (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  cost_point_name VARCHAR(100) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  suggested_selling_price DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  UNIQUE(description, unit, cost_point_name)
);

-- Delete the merged TEST item
DELETE FROM inventory WHERE description = 'TEST';
```

### Step 2: Restart Your Server

```bash
# Stop the server (Ctrl+C in terminal)
# Then start again
npm run dev
```

### Step 3: Re-add Your TEST Item

Go to Inventory page and add:
1. **First batch**: TEST, 12 quantity, expiry 06/22/2026
2. **Second batch**: TEST, 2 quantity, expiry 06/23/2026
3. **Third batch**: TEST, 2 quantity, expiry 06/24/2026

You should now see **3 separate rows** like this:

```
DESCRIPTION | UNIT | QUANTITY | BATCH   | EXPIRY     | UNIT COST | SUGGESTED PRICE
------------|------|----------|---------|------------|-----------|----------------
TEST        | BOX  | 12       | TE-001  | 6/22/2026  | ₱12.00    | ₱22.00
TEST        | BOX  | 2        | TE-002  | 6/23/2026  | ₱12.00    | ₱22.00
TEST        | BOX  | 2        | TE-003  | 6/24/2026  | ₱12.00    | ₱22.00
```

### Step 4: Test the Costs Page

1. Go to "Costs" page (in the menu)
2. Click "Add Cost Point"
3. Add a cost point:
   - Item: TEST
   - Unit: BOX
   - Cost Point Name: Supplier A
   - Unit Cost: 12.00
   - Selling Price: 22.00
4. Save

Now the Costs page will show your cost variations!

## What Each Step Does

**Step 1 (Migration):**
- Fixes the database constraint so different expiry dates = different batches
- Creates the `cost_variations` table for the Costs page
- Deletes your merged TEST item so you can re-add it correctly

**Step 2 (Restart):**
- Loads the new code that uses expiry dates instead of cost batches

**Step 3 (Re-add TEST):**
- Creates 3 separate batches with different expiry dates
- Tests that the fix is working

**Step 4 (Test Costs):**
- Verifies the Costs page is working
- Shows how to track different purchase costs

## Verification

After completing all steps, verify:

✅ Inventory page shows 3 separate TEST batches with different expiry dates
✅ Costs page is accessible and not empty
✅ You can add cost points in the Costs page
✅ Adding same item with different expiry creates new batch (not merged)

## If Something Goes Wrong

If you still see merged batches:
1. Check if the migration ran successfully
2. Make sure you restarted the server
3. Delete the TEST item and re-add it
4. Check database logs for errors

If Costs page is still empty:
1. Check if `cost_variations` table exists: `SELECT * FROM cost_variations;`
2. If not, run the migration again
3. Restart server

## Need Help?

Check these files for more details:
- `RUN_THIS_MIGRATION_NOW.sql` - The complete migration
- `FIX_EXPIRY_BATCHES.md` - Detailed explanation
- `EXPIRY_AND_COSTING_IMPROVEMENTS.md` - Full documentation
