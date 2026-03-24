# Fix Discrepancy Database Issues

## Issues Found
1. ❌ Missing `updated_at` column in `delivery_discrepancies` table
2. ❌ Return requests not removing items from branch inventory

## Solutions Implemented

### 1. Database Schema Fix

**Problem**: The `delivery_discrepancies` table was missing `created_at` and `updated_at` columns.

**Solution**: Run the migration script to add these columns.

#### Migration Script
Run this SQL in your database:
```sql
-- File: server/database/fix_discrepancies_table.sql

-- Add timestamp columns
ALTER TABLE delivery_discrepancies 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE delivery_discrepancies 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows
UPDATE delivery_discrepancies 
SET created_at = reported_at 
WHERE created_at IS NULL;

UPDATE delivery_discrepancies 
SET updated_at = COALESCE(resolved_at, reported_at, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;

-- Update constraint to include 'completed' status
ALTER TABLE delivery_discrepancies 
DROP CONSTRAINT IF EXISTS chk_discrepancy_status;

ALTER TABLE delivery_discrepancies 
ADD CONSTRAINT chk_discrepancy_status 
CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

-- Create auto-update trigger
CREATE OR REPLACE FUNCTION update_discrepancy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_discrepancy_timestamp ON delivery_discrepancies;

CREATE TRIGGER trigger_update_discrepancy_timestamp
BEFORE UPDATE ON delivery_discrepancies
FOR EACH ROW
EXECUTE FUNCTION update_discrepancy_updated_at();
```

### 2. Inventory Deduction Fix

**Problem**: When admin clicks "Add to My Inventory" for return requests, items weren't being removed from branch inventory.

**Solution**: Enhanced the query to handle case-insensitive matching and added extensive logging.

#### Changes Made
1. **Case-insensitive matching**: Uses `LOWER(TRIM())` to match items
2. **Better error messages**: Shows what's in inventory if item not found
3. **Logging**: Console logs show exactly what's happening
4. **Null safety**: Handles null `unit_cost` values

#### Code Changes
```javascript
// Now uses case-insensitive matching
const branchInv = await client.query(
  `SELECT id, quantity, description, unit
   FROM inventory
   WHERE location_id = $1 
   AND LOWER(TRIM(description)) = LOWER(TRIM($2))
   AND LOWER(TRIM(unit)) = LOWER(TRIM($3))
   ORDER BY quantity DESC
   LIMIT 1`,
  [disc.branch_location_id, disc.item_description, disc.unit]
);
```

## How to Apply the Fix

### Step 1: Run Database Migration
Connect to your PostgreSQL database and run:
```bash
psql -U your_username -d your_database -f server/database/fix_discrepancies_table.sql
```

Or copy the SQL from the file and run it in your database client.

### Step 2: Restart Your Server
```bash
# Stop the server (Ctrl+C)
# Then restart
npm start
```

### Step 3: Test the Fix

#### Test Return Request Flow:
1. **Branch**: Create a return request for an item that exists in branch inventory
2. **Admin**: Approve the return request
3. **Admin**: Click "Add to My Inventory"
4. **Verify**: 
   - Check server console logs for detailed output
   - Check branch inventory - item quantity should be reduced
   - Check warehouse inventory - item quantity should be increased
   - Discrepancy status should be "completed" (green badge)

#### Test Shortage Report Flow:
1. **Branch**: Report a shortage (received less than expected)
2. **Admin**: Approve the shortage
3. **Admin**: Click "Add to My Inventory"
4. **Verify**:
   - Check server console logs
   - Check warehouse inventory - missing quantity should be added
   - Branch inventory should remain unchanged
   - Discrepancy status should be "completed"

## Debugging

### Check Server Logs
When you click "Add to My Inventory", you should see logs like:
```
[RETURN] Looking for item in branch 5: "Paracetamol 500mg" (tablet)
[RETURN] Found 1 matching items in branch inventory
[RETURN] Item found: Paracetamol 500mg (tablet) - Qty: 100
[RETURN] Deducting 50 from branch inventory ID 123
[RETURN] Adding 50 to warehouse 1
[RETURN] Successfully completed return process
```

### If Item Not Found
The logs will show:
```
[RETURN] Looking for item in branch 5: "Paracetamol 500mg" (tablet)
[RETURN] Found 0 matching items in branch inventory
[RETURN] Branch inventory items: [list of items]
```

This helps identify:
- Spelling differences
- Case sensitivity issues
- Extra spaces
- Different unit names

### Common Issues

#### Issue: "Item not found in branch inventory"
**Causes**:
- Item description doesn't match exactly
- Unit name is different
- Item was already removed
- Wrong branch location

**Solution**:
1. Check server logs for what's in the branch inventory
2. Verify the item exists in the branch
3. Check for spelling/case differences
4. Ensure the discrepancy was created with correct item details

#### Issue: "Insufficient stock in branch"
**Cause**: Branch doesn't have enough quantity

**Solution**:
1. Check actual branch inventory quantity
2. Verify the return quantity is correct
3. Ensure no other operations removed the items

## Files Modified

1. **server/database/delivery_discrepancies.sql**
   - Added `created_at` and `updated_at` columns

2. **server/database/fix_discrepancies_table.sql** (NEW)
   - Migration script to fix existing databases

3. **server/routes/delivery-discrepancies.js**
   - Enhanced inventory matching (case-insensitive)
   - Added extensive logging
   - Better error messages
   - Null safety for unit_cost

## Verification Checklist

After applying the fix:
- [ ] Database migration ran successfully
- [ ] Server restarted without errors
- [ ] Can create return request
- [ ] Admin can approve return request
- [ ] "Add to My Inventory" button appears
- [ ] Clicking button removes items from branch
- [ ] Items added to warehouse inventory
- [ ] Status changes to "completed"
- [ ] Server logs show detailed process
- [ ] No errors in console

## Prevention

To prevent similar issues in the future:
1. Always include `created_at` and `updated_at` in new tables
2. Use triggers to auto-update timestamps
3. Test inventory operations with actual data
4. Check server logs during testing
5. Use case-insensitive matching for text fields
6. Add comprehensive error messages
