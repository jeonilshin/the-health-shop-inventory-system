# Debugging Inventory Deduction Issue

## Problem
When approving a transfer, inventory is NOT being deducted from the source location, even though the code appears to have the deduction logic.

## What I've Added

### 1. Enhanced Logging in Approval Endpoint
Added detailed console.log statements to track:
- When deduction starts
- How many batches found
- Each batch deduction
- Final remaining amount
- Any errors

**Location:** `server/routes/transfers.js` - approve endpoint

**What to look for in Railway logs:**
```
[TRANSFER APPROVE] Starting inventory deduction for transfer #123
[TRANSFER APPROVE] Need to deduct: 10 box of Paracetamol
[TRANSFER APPROVE] From location: 42
[TRANSFER APPROVE] Found 2 batches at source
[TRANSFER APPROVE] Deducting 5 from batch #456 (had 5)
[TRANSFER APPROVE] After deduction, batch #456 now has: 0
[TRANSFER APPROVE] Deducting 5 from batch #457 (had 10)
[TRANSFER APPROVE] After deduction, batch #457 now has: 5
[TRANSFER APPROVE] Deduction complete. Remaining: 0 (should be 0)
```

### 2. Test Script
Created `test-transfer-approval.js` to test the deduction logic without actually approving.

**How to run:**
```bash
node test-transfer-approval.js
```

**What it does:**
1. Finds a pending transfer
2. Shows inventory BEFORE deduction
3. Simulates the FIFO deduction
4. Shows inventory AFTER deduction
5. Verifies the math
6. Rolls back (doesn't actually change anything)

---

## Debugging Steps

### Step 1: Check Railway Logs
1. Go to your Railway dashboard
2. Open the logs
3. Approve a transfer
4. Look for `[TRANSFER APPROVE]` messages
5. Check if the deduction is happening

**Possible outcomes:**

#### A) You see the logs and deduction happens:
```
[TRANSFER APPROVE] Deducting 10 from batch #123 (had 50)
[TRANSFER APPROVE] After deduction, batch #123 now has: 40
```
✅ **Deduction is working!** The issue might be:
- You're looking at the wrong location
- Browser cache showing old data
- Need to refresh the inventory page

#### B) You see the logs but deduction shows 0 batches:
```
[TRANSFER APPROVE] Found 0 batches at source
```
❌ **Inventory not found!** Possible causes:
- Item doesn't exist at source location
- Description or unit doesn't match exactly
- Schema issue (thehealthshop vs public)

#### C) You don't see any `[TRANSFER APPROVE]` logs:
❌ **Approval endpoint not being called!** Possible causes:
- Using old code (not deployed)
- Calling wrong endpoint
- Error happening before deduction code

### Step 2: Run the Test Script
```bash
node test-transfer-approval.js
```

This will show you exactly what's happening with the deduction logic.

### Step 3: Check Database Directly
```sql
-- Check if inventory exists at source
SELECT 
    i.id,
    i.location_id,
    l.name as location_name,
    i.description,
    i.unit,
    i.quantity
FROM inventory i
LEFT JOIN locations l ON i.location_id = l.id
WHERE i.location_id = SOURCE_LOCATION_ID
  AND i.description = 'ITEM_NAME'
  AND i.unit = 'UNIT';
```

---

## Common Issues and Solutions

### Issue 1: Description/Unit Mismatch
**Problem:** Transfer has "Paracetamol 500mg" but inventory has "Paracetamol 500 mg" (extra space)

**Solution:** Ensure exact match when creating transfers

### Issue 2: Schema Issue
**Problem:** Queries looking in wrong schema

**Solution:** Check `server/config/database.js` has:
```javascript
SET search_path TO thehealthshop, public
```

### Issue 3: Transaction Rollback
**Problem:** Deduction happens but transaction rolls back due to error later

**Solution:** Check logs for errors after deduction

### Issue 4: Old Code Deployed
**Problem:** Railway is running old code without deduction logic

**Solution:** 
1. Check git commit hash in Railway
2. Redeploy if needed
3. Verify logs show new `[TRANSFER APPROVE]` messages

---

## Quick Fix: Manual Deduction

If you need to fix it immediately while debugging:

```sql
BEGIN;

-- Deduct from source
UPDATE inventory 
SET quantity = quantity - TRANSFER_QUANTITY
WHERE location_id = SOURCE_LOCATION_ID
  AND description = 'ITEM_NAME'
  AND unit = 'UNIT';

-- Verify
SELECT location_id, description, quantity 
FROM inventory 
WHERE description = 'ITEM_NAME';

COMMIT;
```

---

## Next Steps

1. **Deploy the updated code** with logging to Railway
2. **Create a test transfer** and approve it
3. **Check Railway logs** for `[TRANSFER APPROVE]` messages
4. **Run test script** locally to verify logic works
5. **Report back** what you see in the logs

---

## Expected Behavior

### When Approval Works Correctly:

**Before Approval:**
- Branch A: 100 units
- Branch B: 50 units
- Total: 150 units

**After Approval (transfer 10 units):**
- Branch A: 90 units ✅ (deducted)
- Branch B: 50 units (not changed yet)
- Total: 140 units (10 units "in transit")

**After Receive:**
- Branch A: 90 units
- Branch B: 60 units ✅ (added)
- Total: 150 units ✅ (back to original)

---

## Files Modified

1. `server/routes/transfers.js` - Added detailed logging to approve endpoint
2. `test-transfer-approval.js` - Test script to verify deduction logic
3. `DEBUGGING_INVENTORY_DEDUCTION.md` - This guide

---

## Contact Points

If the issue persists after checking logs:
1. Share the Railway logs showing the `[TRANSFER APPROVE]` messages
2. Share the output of `test-transfer-approval.js`
3. Share a screenshot of the inventory before/after approval

This will help identify exactly where the issue is!
