# Improved Discrepancy Flow

## Overview
Updated the discrepancy approval process to use a two-step workflow where admin approves first, then manually adds items to inventory.

## Previous Flow (Issue)
1. Branch reports discrepancy (shortage or return)
2. Admin approves → Inventory moved immediately
3. Status: "Approved" (green badge)

**Problem**: Inventory was moved automatically without admin control, and for returns, items weren't being removed from branch inventory properly.

## New Flow (Fixed)

### For Shortage Reports
1. **Branch**: Reports shortage (received less than expected)
2. **Admin**: Reviews and clicks "Approve"
   - Status changes to "Approved" (blue badge)
   - NO inventory movement yet
3. **Admin**: Sees "Add to My Inventory" button (blue)
4. **Admin**: Clicks button to add missing items to warehouse
   - Items added to warehouse inventory
   - Status changes to "Completed" (green badge with checkmark)
   - Badge text: "Added to Inventory"

### For Return Requests
1. **Branch**: Requests to return items to warehouse
2. **Admin**: Reviews and clicks "Approve"
   - Status changes to "Approved" (blue badge)
   - NO inventory movement yet
   - Items still in branch inventory
3. **Admin**: Sees "Add to My Inventory" button (blue)
4. **Admin**: Clicks button to complete return
   - Items REMOVED from branch inventory
   - Items ADDED to warehouse inventory
   - Status changes to "Completed" (green badge)
   - Badge text: "Added to Inventory"

## Status Flow

```
pending (orange) 
  ↓ [Admin clicks "Approve"]
approved (blue) 
  ↓ [Admin clicks "Add to My Inventory"]
completed (green) - "Added to Inventory"

OR

pending (orange)
  ↓ [Admin clicks "Reject"]
rejected (red)
```

## Database Changes

### New Status
Added `completed` status to `delivery_discrepancies` table:
- `pending`: Initial state
- `approved`: Admin approved, awaiting inventory addition
- `completed`: Items added to inventory
- `rejected`: Admin rejected

### Migration File
`server/database/add_completed_status_to_discrepancies.sql`

## Backend Changes

### New Endpoint
**PUT** `/api/delivery-discrepancies/:id/add-to-inventory`
- Admin only
- Requires status to be "approved"
- Moves inventory based on type:
  - **Shortage**: Adds missing quantity to warehouse
  - **Return**: Removes from branch, adds to warehouse
- Updates status to "completed"
- Sends notification to branch

### Updated Endpoint
**PUT** `/api/delivery-discrepancies/:id/approve`
- Now only changes status to "approved"
- Does NOT move inventory
- Notifies branch of approval

## Frontend Changes

### Discrepancy Component
1. **New Handler**: `handleAddToInventory(disc)`
   - Calls new backend endpoint
   - Shows confirmation dialog
   - Different messages for shortage vs return

2. **Updated Status Badge**:
   - `pending`: Orange - "Pending"
   - `approved`: Blue - "Approved"
   - `completed`: Green - "Added to Inventory"
   - `rejected`: Red - "Rejected"

3. **Action Buttons**:
   - **Pending (Admin)**: "Approve" | "Reject"
   - **Approved (Admin)**: Blue button "Add to My Inventory"
   - **Completed**: Green badge with checkmark
   - **Branch**: Only sees status badges

4. **Filter Dropdown**: Added "Added to Inventory" option

## User Experience

### Admin View
- Sees pending discrepancies with Approve/Reject buttons
- After approving, sees blue "Add to My Inventory" button
- Can review before actually moving inventory
- Clear visual feedback with status badges

### Branch View
- Reports discrepancy
- Sees "Approved" status when admin approves
- Sees "Added to Inventory" when completed
- For returns: Items remain in inventory until admin completes the process

## Benefits
1. **Two-step approval**: Admin can review before moving inventory
2. **Clear status tracking**: Three distinct states (approved vs completed)
3. **Proper inventory handling**: Returns now correctly remove from branch
4. **Better control**: Admin decides when to add items
5. **Visual clarity**: Different colors for different states

## Files Modified
1. `server/routes/delivery-discrepancies.js` - Split approve into two endpoints
2. `server/database/delivery_discrepancies.sql` - Added completed status
3. `server/database/add_completed_status_to_discrepancies.sql` - Migration file
4. `client/src/components/Discrepancy.js` - Updated UI and handlers

## Testing Checklist
- [ ] Branch can report shortage
- [ ] Branch can request return
- [ ] Admin can approve discrepancy
- [ ] Admin sees "Add to My Inventory" button after approval
- [ ] Clicking button moves inventory correctly
- [ ] Status changes to "completed" with green badge
- [ ] Branch sees updated status
- [ ] Return requests remove items from branch inventory
- [ ] Shortage reports add items to warehouse only
