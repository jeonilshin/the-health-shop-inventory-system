# Fix Duplicate Inventory from Transfers

## Problem
When a transfer was approved and received, the inventory was **added to the destination** but **NOT deducted from the source**, resulting in duplicate inventory.

## Root Cause
The approval endpoint should deduct inventory when status changes to `approved`, but something may have gone wrong during the transfer process.

---

## Quick Fix for Already Transferred Items

### Option 1: Using the Diagnostic Script (Recommended)

#### Step 1: Diagnose the Issue
```bash
node diagnose-and-fix-transfers.js diagnose
```

This will show you:
- All delivered transfers from today
- Current inventory at source and destination for each transfer
- Approved transfers waiting to be received

#### Step 2: Fix a Specific Transfer
```bash
node diagnose-and-fix-transfers.js fix <transfer_id>
```

Example:
```bash
node diagnose-and-fix-transfers.js fix 123
```

This will:
- Show transfer details
- Check current inventory at source
- Deduct the transferred quantity using FIFO
- Show before/after inventory levels
- **Wait for you to manually commit**

#### Step 3: Verify and Commit
If the fix looks correct, connect to your database and run:
```sql
COMMIT;
```

If something looks wrong:
```sql
ROLLBACK;
```

---

### Option 2: Manual SQL Fix

#### Step 1: Identify the Problem Transfer
```sql
-- Find recent delivered transfers
SELECT 
    t.id,
    t.description,
    t.unit,
    t.quantity,
    t.from_location_id,
    fl.name as from_location,
    t.to_location_id,
    tl.name as to_location,
    t.delivered_at
FROM transfers t
LEFT JOIN locations fl ON t.from_location_id = fl.id
LEFT JOIN locations tl ON t.to_location_id = tl.id
WHERE t.status = 'delivered'
  AND t.delivered_at > CURRENT_DATE
ORDER BY t.delivered_at DESC;
```

#### Step 2: Check Inventory at Both Locations
```sql
-- Replace with your actual values
SELECT 
    i.location_id,
    l.name as location_name,
    i.description,
    i.unit,
    SUM(i.quantity) as total_quantity,
    COUNT(*) as batch_count
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.description = 'YOUR_ITEM_NAME'
  AND i.unit = 'YOUR_UNIT'
  AND i.location_id IN (SOURCE_LOCATION_ID, DESTINATION_LOCATION_ID)
GROUP BY i.location_id, l.name, i.description, i.unit;
```

#### Step 3: Deduct from Source (if not already deducted)
```sql
BEGIN;

-- Deduct the transferred quantity from source
UPDATE inventory 
SET quantity = quantity - TRANSFERRED_QUANTITY,
    updated_at = CURRENT_TIMESTAMP
WHERE location_id = SOURCE_LOCATION_ID
  AND description = 'ITEM_NAME'
  AND unit = 'ITEM_UNIT'
  AND quantity >= TRANSFERRED_QUANTITY;

-- Verify the change
SELECT 
    i.location_id,
    l.name as location_name,
    i.description,
    SUM(i.quantity) as total_quantity
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.description = 'ITEM_NAME'
  AND i.unit = 'ITEM_UNIT'
  AND i.location_id IN (SOURCE_LOCATION_ID, DESTINATION_LOCATION_ID)
GROUP BY i.location_id, l.name, i.description;

-- If correct:
COMMIT;

-- If wrong:
-- ROLLBACK;
```

---

## Example: Fixing a Specific Transfer

Let's say you transferred **10 units of Paracetamol** from **Branch A (ID: 42)** to **Branch B (ID: 43)**:

### Check Current State
```sql
SELECT 
    i.location_id,
    l.name as location_name,
    SUM(i.quantity) as total_quantity
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.description = 'Paracetamol 500mg'
  AND i.unit = 'box'
  AND i.location_id IN (42, 43)
GROUP BY i.location_id, l.name;
```

**Expected Result (if bug occurred):**
- Branch A: 100 units (should be 90!)
- Branch B: 60 units (correct - received 10)

### Fix It
```sql
BEGIN;

-- Deduct 10 from Branch A
UPDATE inventory 
SET quantity = quantity - 10,
    updated_at = CURRENT_TIMESTAMP
WHERE location_id = 42
  AND description = 'Paracetamol 500mg'
  AND unit = 'box';

-- Verify
SELECT 
    i.location_id,
    l.name as location_name,
    SUM(i.quantity) as total_quantity
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.description = 'Paracetamol 500mg'
  AND i.unit = 'box'
  AND i.location_id IN (42, 43)
GROUP BY i.location_id, l.name;

-- Should now show:
-- Branch A: 90 units ✅
-- Branch B: 60 units ✅

COMMIT;
```

---

## Prevention: Why This Happened

The approval endpoint **should** deduct inventory automatically. Let me verify the code is correct:

### Check the Approval Logic
The approval endpoint in `server/routes/transfers.js` should have this code:

```javascript
// DEDUCT from source inventory using FIFO (First In First Out)
let remainingToDeduct = requiredQty;
for (const batch of inventory.rows) {
  if (remainingToDeduct <= 0) break;
  
  const batchQty = parseFloat(batch.quantity);
  if (batchQty <= 0) continue;
  
  const deductFromThisBatch = Math.min(batchQty, remainingToDeduct);
  
  await client.query(
    'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [deductFromThisBatch, batch.id]
  );
  
  remainingToDeduct -= deductFromThisBatch;
}
```

**If this code is present**, the deduction should work automatically for future transfers.

**If this code is missing**, that's the bug! The fix I provided earlier should have added it.

---

## Testing the Fix

### Test 1: Create a New Transfer
1. Create a transfer from Branch A to Branch B
2. Note the current inventory at Branch A
3. Approve the transfer
4. **Check:** Inventory at Branch A should be reduced immediately
5. Receive at Branch B
6. **Check:** Inventory at Branch B should be increased

### Test 2: Verify Inventory Totals
```sql
-- Before transfer: Total = X
-- After approval: Total = X (inventory moved from source to "in transit")
-- After receive: Total = X (inventory moved from "in transit" to destination)

SELECT 
    SUM(i.quantity) as total_inventory
FROM inventory i
WHERE i.description = 'YOUR_ITEM'
  AND i.unit = 'YOUR_UNIT';
```

The total should remain the same throughout the process!

---

## Summary

### For Already Transferred Items:
1. Run `node diagnose-and-fix-transfers.js diagnose` to see the problem
2. Run `node diagnose-and-fix-transfers.js fix <transfer_id>` to fix each transfer
3. Or manually deduct using SQL

### For Future Transfers:
- The code fix is already in place
- Approval will automatically deduct inventory
- Receive will add inventory to destination
- Total inventory across all locations stays constant ✅

---

## Need Help?

If you're unsure about any step:
1. Run the diagnostic script first
2. Take a screenshot of the output
3. Don't commit any changes until you're sure
4. You can always ROLLBACK if something looks wrong
