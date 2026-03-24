# How to Fix Duplicate Inventory

## 🐛 The Problem

You have duplicate inventory because you accepted the same delivery twice:
1. Once in Transfers page ("Received" button)
2. Once in Deliveries page ("Accept Delivery" button)

**Example:**
- Delivery: 12 items
- You clicked "Received": +12 items
- You clicked "Accept Delivery": +12 items (duplicate!)
- **Total:** 24 items (should be 12!)

Then you reported a shortage:
- Expected: 12
- Received: 2
- Missing: 10

But your inventory still shows 24 because:
- Shortage approval adds +10 to warehouse
- Shortage approval does NOT remove from your inventory
- You still have the 24 duplicate items

---

## ✅ Solution: Use Return Request

### Step-by-Step:

1. **Calculate how much to return:**
   ```
   Current inventory: 24 items
   Should have: 2 items (what you actually received)
   Need to return: 24 - 2 = 22 items
   ```

2. **Create return request:**
   - Go to: Deliveries page
   - Click: "Request Return to Warehouse" (top right)
   - Fill out:
     - Item Description: [Your item name]
     - Unit: [box/pcs/bottle]
     - Quantity to Return: 22
     - Return to Warehouse: [Select warehouse]
     - Note: "Duplicate inventory from accepting delivery twice. Actual received: 2, but have 24 due to duplicate acceptance. Returning excess 22."
   - Click: "Submit Return Request"

3. **Admin approves:**
   - Admin sees your return request
   - Admin clicks "Approve"
   - System automatically:
     - Removes 22 from your inventory
     - Adds 22 to warehouse

4. **Result:**
   ```
   Your inventory: 24 - 22 = 2 ✅ (correct!)
   Warehouse: Gets +22 back
   ```

---

## 🔍 How to Identify Duplicate Inventory

### Check Your Inventory:

Look for items with unusually high quantities that don't match your records.

### SQL Query to Find Duplicates:

```sql
-- Find items that might be duplicates
SELECT 
  i.id,
  i.description,
  i.unit,
  i.quantity,
  l.name as location,
  i.updated_at
FROM inventory i
JOIN locations l ON i.location_id = l.id
WHERE i.location_id = YOUR_BRANCH_ID
  AND i.quantity > 20  -- Adjust threshold as needed
ORDER BY i.updated_at DESC;
```

### Check Recent Deliveries:

```sql
-- Find deliveries that might have been accepted twice
SELECT 
  d.id as delivery_id,
  d.status as delivery_status,
  d.delivered_date,
  t.id as transfer_id,
  t.status as transfer_status,
  t.delivered_at,
  di.description,
  di.quantity
FROM deliveries d
JOIN transfers t ON d.transfer_id = t.id
JOIN delivery_items di ON d.id = di.delivery_id
WHERE d.to_location_id = YOUR_BRANCH_ID
  AND d.status = 'delivered'
  AND t.status = 'delivered'
ORDER BY d.created_at DESC;
```

If both `delivered_date` and `delivered_at` are filled, the delivery was likely accepted twice!

---

## 📊 Example Scenarios

### Scenario 1: Simple Duplicate

**What happened:**
- Delivery: 10 boxes
- Clicked "Received": +10
- Clicked "Accept Delivery": +10
- Total: 20 boxes

**Fix:**
- Return request: 10 boxes
- Note: "Duplicate from accepting twice"
- After approval: 20 - 10 = 10 ✅

### Scenario 2: Duplicate + Shortage (Your Case!)

**What happened:**
- Delivery: 12 boxes
- Clicked "Received": +12
- Clicked "Accept Delivery": +12
- Total: 24 boxes
- But actually only received: 2 boxes
- Reported shortage: 10 missing

**Fix:**
- Return request: 22 boxes (24 - 2)
- Note: "Duplicate inventory + shortage. Actually received 2, but have 24. Returning 22."
- After approval: 24 - 22 = 2 ✅

### Scenario 3: Duplicate + Partial Use

**What happened:**
- Delivery: 15 boxes
- Clicked "Received": +15
- Clicked "Accept Delivery": +15
- Total: 30 boxes
- Already sold: 5 boxes
- Current inventory: 25 boxes
- Should have: 10 boxes (15 - 5 sold)

**Fix:**
- Return request: 15 boxes (the duplicate amount)
- Note: "Duplicate from accepting twice. Returning duplicate portion."
- After approval: 25 - 15 = 10 ✅

---

## 🛠️ Alternative: Manual Adjustment (Admin Only)

If you're an admin and want to fix it quickly:

### Option A: Edit Inventory Directly

1. Go to Inventory page
2. Find the item
3. Click edit
4. Change quantity from 24 to 2
5. Add note: "Fixed duplicate from transfer/delivery bug"
6. Save

### Option B: SQL Update (Database Access)

```sql
-- Update specific item
UPDATE inventory
SET 
  quantity = 2,  -- The correct amount
  updated_at = CURRENT_TIMESTAMP
WHERE location_id = YOUR_BRANCH_ID
  AND description = 'Your Item Name'
  AND unit = 'box';

-- Verify
SELECT * FROM inventory
WHERE location_id = YOUR_BRANCH_ID
  AND description = 'Your Item Name';
```

⚠️ **WARNING:** Only use SQL if you're absolutely sure about the correct quantity!

---

## 📋 Prevention (Already Fixed!)

The duplicate bug has been fixed:
- ✅ Can't use "Received" button in Transfers page anymore (blocked)
- ✅ Must use "Accept Delivery" in Deliveries page only
- ✅ Auto-sync prevents out-of-sync statuses

**Going forward:** No more duplicates will happen!

---

## 🎯 Summary

### Your Specific Case:

**Current situation:**
- Inventory: 24 items
- Should have: 2 items
- Difference: 22 items (duplicate)

**What to do:**
1. Create return request for 22 items
2. Wait for admin approval
3. Inventory will be corrected to 2 items

**Why shortage didn't fix it:**
- Shortage is for items you NEVER received
- You reported: "Expected 12, received 2, missing 10"
- Shortage adds +10 to warehouse
- Shortage does NOT remove from your inventory
- You need a RETURN request to remove the 22 duplicate items

### The Difference:

| Type | Use When | Effect on Your Inventory |
|------|----------|-------------------------|
| **Shortage** | You received LESS than expected | No change (you don't have it) |
| **Return** | You have EXTRA items to send back | Decreases (items removed) |

### Next Steps:

1. Go to Deliveries page
2. Click "Request Return to Warehouse"
3. Return 22 items with note explaining duplicate
4. Admin approves
5. Your inventory: 2 items ✅ (correct!)
