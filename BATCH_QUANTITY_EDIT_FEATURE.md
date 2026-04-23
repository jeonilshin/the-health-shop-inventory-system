# Batch Quantity & Expiry Edit Feature

## Summary
Admin can now edit **both quantity and expiry date** when editing batches with different expiry dates in the inventory page.

---

## What Changed

### Before:
- Admin could only edit **expiry date** when clicking the edit button on a batch
- Quantity was read-only

### After:
- Admin can edit **both quantity AND expiry date** in the same edit mode
- Both fields appear side-by-side when editing

---

## How It Works

### Step 1: View Batches
1. Go to `/inventory` page as admin
2. Find an item with multiple expiry dates (shows "Multiple Expiry Dates" badge)
3. Click the item row to expand and see all batches

### Step 2: Edit Batch
1. Click the **Edit** button (pencil icon) on any batch
2. Two input fields appear:
   - **Qty:** Edit the quantity
   - **Expiry:** Edit the expiry date

### Step 3: Save Changes
1. Modify quantity and/or expiry date
2. Click the **Save** button (checkmark icon)
3. Changes are saved to the database

---

## UI Changes

### Edit Mode Display:
```
┌─────────────────────────────────────────────────────┐
│ Qty: [80.00]  Expiry: [2025-12-31]                 │
│      ↑ editable    ↑ editable                       │
└─────────────────────────────────────────────────────┘
```

### Normal Display:
```
┌─────────────────────────────────────────────────────┐
│ Expiry: 12/31/2025                                  │
└─────────────────────────────────────────────────────┘
```

---

## Use Cases

### Use Case 1: Adjust Quantity After Physical Count
**Scenario:** Physical inventory count shows 75 units but system shows 80

**Solution:**
1. Click edit on the batch
2. Change quantity from 80 to 75
3. Save

### Use Case 2: Correct Wrong Expiry Date
**Scenario:** Expiry date was entered incorrectly

**Solution:**
1. Click edit on the batch
2. Change expiry date to correct date
3. Save

### Use Case 3: Adjust Both
**Scenario:** Found 5 expired units that need to be removed, and corrected the expiry date

**Solution:**
1. Click edit on the batch
2. Reduce quantity by 5
3. Update expiry date
4. Save

---

## Technical Details

### Frontend Changes (`client/src/components/Inventory.js`)

#### 1. Updated Batch Edit Display
Added quantity input field next to expiry date input:

```javascript
{isEditing && user.role === 'admin' ? (
  <>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>Qty:</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={batchEditData.quantity}
        onChange={(e) => setBatchEditData({...batchEditData, quantity: e.target.value})}
      />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>Expiry:</span>
      <input
        type="date"
        value={batchEditData.expiry_date}
        onChange={(e) => setBatchEditData({...batchEditData, expiry_date: e.target.value})}
      />
    </div>
  </>
) : (
  // Normal display
)}
```

#### 2. Updated Button Title
Changed from "Edit Batch Expiry" to "Edit Batch Quantity & Expiry"

#### 3. Existing Logic Reused
- `handleEditBatch()` already included quantity in edit data
- `handleSaveBatchEdit()` already saved quantity to backend
- No backend changes needed!

---

## Backend Support

The backend already supports updating quantity through the existing inventory update endpoint:

**Endpoint:** `PUT /api/inventory/:id`

**Request Body:**
```json
{
  "quantity": 75.00,
  "expiry_date": "2025-12-31",
  "description": "Paracetamol 500mg",
  "unit": "box",
  "unit_cost": 50.00,
  "suggested_selling_price": 75.00,
  "batch_number": "BATCH-001"
}
```

---

## Permissions

### Who Can Edit:
- ✅ **Admin** - Can edit both quantity and expiry date

### Who Cannot Edit:
- ❌ **Manager** - Read-only access
- ❌ **Staff** - Read-only access
- ❌ **Warehouse** - Read-only access

---

## Validation

### Quantity Validation:
- Must be a number
- Must be >= 0
- Supports decimals (up to 2 decimal places)
- Cannot be negative

### Expiry Date Validation:
- Must be a valid date
- Can be left empty (no expiry date)
- No restriction on past dates (allows editing expired items)

---

## Example Workflow

### Scenario: Physical Inventory Adjustment

**Initial State:**
```
Item: Paracetamol 500mg
Batch 1: 100 units, Expiry: 2025-06-30
Batch 2: 80 units, Expiry: 2025-12-31
Total: 180 units
```

**Physical Count Shows:**
```
Batch 1: 95 units (5 damaged)
Batch 2: 75 units (5 sold but not recorded)
```

**Fix:**
1. Edit Batch 1: Change quantity from 100 to 95
2. Edit Batch 2: Change quantity from 80 to 75
3. Save both

**Result:**
```
Item: Paracetamol 500mg
Batch 1: 95 units, Expiry: 2025-06-30 ✅
Batch 2: 75 units, Expiry: 2025-12-31 ✅
Total: 170 units ✅
```

---

## Benefits

### ✅ Faster Corrections
- Edit quantity and expiry in one action
- No need to delete and re-add batches

### ✅ Better Inventory Accuracy
- Easy to adjust after physical counts
- Quick corrections for data entry errors

### ✅ Audit Trail
- All changes logged in audit log
- Track who changed what and when

### ✅ Flexible Management
- Can adjust quantity without changing expiry
- Can adjust expiry without changing quantity
- Can adjust both at once

---

## Files Modified

1. ✅ `client/src/components/Inventory.js`
   - Added quantity input field in batch edit mode
   - Updated button title
   - Improved layout with flexbox

---

## Testing Checklist

### As Admin:
- [ ] Open inventory page
- [ ] Find item with multiple expiry dates
- [ ] Click to expand batches
- [ ] Click edit button on a batch
- [ ] See both quantity and expiry date fields
- [ ] Edit quantity only → Save → Verify change
- [ ] Edit expiry only → Save → Verify change
- [ ] Edit both → Save → Verify both changes
- [ ] Cancel edit → Verify no changes saved

### As Manager/Staff:
- [ ] Cannot see edit button (read-only)
- [ ] Can only view batch information

---

## Future Enhancements

### Optional:
1. Add "Reason for Change" field for audit purposes
2. Show before/after comparison before saving
3. Add bulk edit for multiple batches
4. Add quantity adjustment history per batch
5. Add warning if quantity reduced significantly

---

**Implementation Date:** April 23, 2026  
**Status:** ✅ Complete and Ready to Test  
**Impact:** Low risk, high value for inventory management
