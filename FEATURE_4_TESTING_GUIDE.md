# Feature 4: Batch Selection - Testing Guide

## Quick Test Scenarios

### Test 1: Accept Delivery with Multiple Batches ✅

**Setup:**
1. Ensure warehouse has a product with multiple batches (different expiry dates)
2. Create a delivery from warehouse to branch with that product
3. Admin confirms the delivery

**Steps:**
1. Login as branch manager or branch staff
2. Go to Deliveries page
3. Find the confirmed delivery in "Incoming Deliveries" section
4. Click "Accept" button

**Expected Result:**
- Batch selection modal should open
- Shows all available batches with:
  - Batch numbers
  - Available quantities
  - Expiry dates
  - Expiry status indicators (if applicable)
- Can enter quantities for each batch
- "Fill" button works to auto-fill quantities
- Total selected quantity matches requested quantity
- "Confirm & Accept Delivery" button becomes enabled when quantities match
- After confirming, delivery is accepted and inventory is updated

---

### Test 2: Accept Delivery with Single Batch ✅

**Setup:**
1. Ensure warehouse has a product with only ONE batch
2. Create a delivery from warehouse to branch with that product
3. Admin confirms the delivery

**Steps:**
1. Login as branch manager or branch staff
2. Go to Deliveries page
3. Find the confirmed delivery
4. Click "Accept" button

**Expected Result:**
- **No modal should appear** (seamless acceptance)
- Delivery is accepted immediately
- Confirmation message shows
- Inventory is updated using the single available batch

---

### Test 3: Batch Selection with Expired Batches ⚠️

**Setup:**
1. Create batches with past expiry dates in warehouse inventory
2. Create a delivery with products that have expired batches
3. Admin confirms the delivery

**Steps:**
1. Login as branch user
2. Go to Deliveries page
3. Click "Accept" on the delivery

**Expected Result:**
- Batch selection modal opens
- Expired batches show "⚠️ EXPIRED" warning in red
- Batches expiring within 30 days show "⏰ Expiring Soon" in orange
- User can still select expired batches (business decision)
- Visual warnings help user make informed decisions

---

### Test 4: Partial Quantities from Multiple Batches ✅

**Setup:**
1. Warehouse has product with 3 batches:
   - Batch A: 5 units
   - Batch B: 10 units
   - Batch C: 8 units
2. Create delivery requesting 15 units
3. Admin confirms

**Steps:**
1. Login as branch user
2. Click "Accept" on delivery
3. In batch selection modal:
   - Enter 5 for Batch A
   - Enter 7 for Batch B
   - Enter 3 for Batch C
4. Verify total shows 15 units (matches requested)
5. Click "Confirm & Accept Delivery"

**Expected Result:**
- Modal accepts the selection
- Inventory is updated:
  - Warehouse: Batch A reduced by 5, Batch B by 7, Batch C by 3
  - Branch: Receives 3 separate batch entries (5 + 7 + 3)
- Batch information (batch_number, expiry_date) is preserved

---

### Test 5: Fill Button Functionality ✅

**Setup:**
1. Delivery requesting 20 units
2. Multiple batches available

**Steps:**
1. Open batch selection modal
2. Click "Fill" button on first batch
3. Observe quantity auto-filled
4. Click "Fill" on second batch
5. Observe remaining quantity filled

**Expected Result:**
- First "Fill" fills maximum from that batch (up to requested quantity)
- Second "Fill" fills remaining quantity needed
- Total always matches requested quantity
- Cannot overfill beyond requested amount

---

### Test 6: Validation - Incorrect Quantities ❌

**Setup:**
1. Delivery requesting 10 units
2. Multiple batches available

**Steps:**
1. Open batch selection modal
2. Enter quantities that total to 8 (less than requested)
3. Try to click "Confirm & Accept Delivery"

**Expected Result:**
- Button is **disabled** (grayed out)
- Border shows orange (incomplete)
- Badge shows "Need more"
- Cannot submit until quantities match

**Repeat with:**
- Total = 12 (more than requested) → Badge shows "Too much"
- Total = 10 (exact match) → Button enabled, border green

---

### Test 7: Cancel Batch Selection ✅

**Steps:**
1. Open batch selection modal
2. Make some selections
3. Click "Cancel" or "×" button

**Expected Result:**
- Modal closes
- Delivery remains unaccepted
- No inventory changes
- Can open modal again with fresh state

---

### Test 8: Multiple Items with Mixed Batches ✅

**Setup:**
1. Create delivery with 3 items:
   - Item A: Single batch available
   - Item B: Multiple batches available
   - Item C: Multiple batches available

**Steps:**
1. Click "Accept" on delivery

**Expected Result:**
- Modal opens (because at least one item has multiple batches)
- Item A shows "Single batch available" message
- Items B and C show batch selection interface
- Must select correct quantities for B and C
- Item A automatically uses its single batch

---

### Test 9: FIFO Fallback (No Batch Selection) ✅

**Setup:**
1. Create delivery with multiple batches available
2. Admin confirms

**Steps:**
1. **Directly call the API** (bypass UI):
   ```javascript
   POST /deliveries/:id/accept
   // No batch_selections parameter
   ```

**Expected Result:**
- Backend uses FIFO logic
- Selects batches based on expiry date (oldest first)
- Then by creation date (oldest first)
- Inventory updated correctly
- Backward compatible with old behavior

---

### Test 10: Access Control ✅

**Test 10a: Branch Staff**
- Login as branch staff
- Should see deliveries for their location only
- Can accept deliveries with batch selection

**Test 10b: Branch Manager**
- Login as branch manager
- Should see deliveries for all managed branches
- Can accept deliveries with batch selection

**Test 10c: Admin**
- Login as admin
- Can accept any delivery
- Can use batch selection

**Test 10d: Warehouse**
- Login as warehouse user
- Should NOT see branch acceptance options
- Cannot accept deliveries (they create them)

---

## API Testing (Postman/cURL)

### Get Available Batches
```bash
GET /api/deliveries/:id/available-batches
Authorization: Bearer <token>
```

**Expected Response:**
```json
{
  "delivery_id": 123,
  "from_location_id": 1,
  "to_location_id": 2,
  "items": [
    {
      "item_id": 456,
      "description": "Product Name",
      "unit": "PC",
      "requested_quantity": 10,
      "available_batches": [...]
    }
  ]
}
```

### Accept with Batch Selection
```bash
POST /api/deliveries/:id/accept
Authorization: Bearer <token>
Content-Type: application/json

{
  "batch_selections": [
    {
      "item_id": 456,
      "batch_ids": [789, 790],
      "quantities": [5, 5]
    }
  ]
}
```

**Expected Response:**
```json
{
  "message": "Delivery accepted! Items added to your inventory and transfer completed."
}
```

---

## Database Verification

After accepting a delivery with batch selection, verify in database:

```sql
-- Check source inventory (warehouse) - quantities should be reduced
SELECT * FROM inventory 
WHERE location_id = <warehouse_id> 
  AND description = '<product_name>'
ORDER BY expiry_date;

-- Check destination inventory (branch) - new batches should be added
SELECT * FROM inventory 
WHERE location_id = <branch_id> 
  AND description = '<product_name>'
ORDER BY expiry_date;

-- Verify batch information is preserved
SELECT 
  description, 
  unit, 
  quantity, 
  batch_number, 
  expiry_date, 
  cost_batch_id 
FROM inventory 
WHERE location_id = <branch_id> 
  AND description = '<product_name>';

-- Check audit log
SELECT * FROM audit_log 
WHERE action = 'DELIVERY_ACCEPT' 
ORDER BY created_at DESC 
LIMIT 5;
```

---

## Common Issues & Troubleshooting

### Issue 1: Modal doesn't open
**Possible Causes:**
- Only one batch available → Working as designed (auto-accepts)
- No batches available → Should show error
- API error → Check browser console

### Issue 2: Quantities don't match
**Solution:**
- Use "Fill" button to auto-fill
- Check that total selected = requested quantity
- Verify no decimal rounding issues

### Issue 3: Batch information not preserved
**Check:**
- Database has batch_number, expiry_date columns
- Backend is passing batch info in INSERT statement
- No database constraints preventing batch data

### Issue 4: Access denied
**Check:**
- User role has permission (admin, branch_manager, branch_staff)
- User's location_id matches delivery destination
- Manager has access to the branch (manager_branches table)

---

## Performance Testing

### Large Number of Batches
1. Create product with 50+ batches
2. Create delivery with that product
3. Open batch selection modal
4. Verify:
   - Modal loads within 2 seconds
   - Scrolling is smooth
   - Quantity inputs are responsive

### Concurrent Deliveries
1. Create multiple deliveries
2. Accept them simultaneously from different users
3. Verify:
   - No race conditions
   - Inventory updates correctly
   - No duplicate batch transfers

---

## Success Criteria

✅ All test scenarios pass
✅ No console errors
✅ Inventory updates correctly in database
✅ Batch information is preserved
✅ UI is responsive and intuitive
✅ Access control works correctly
✅ FIFO fallback works when needed
✅ Audit logs are created
✅ Notifications are sent

---

## Next Steps After Testing

1. If all tests pass → Mark Feature 4 as **COMPLETE** ✅
2. Document any bugs found
3. Discuss Feature 3 (Overage) with user as requested
4. Consider adding batch selection to manager confirmation flow
5. Monitor production usage for edge cases

---

**Testing Status:** Ready for QA
**Estimated Testing Time:** 1-2 hours for complete test suite
