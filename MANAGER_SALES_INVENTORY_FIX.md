# Manager Sales & Inventory Page Fixes

## Problems Fixed

### 1. Sales Page - Missing Branch Column for Managers
**Issue**: Managers couldn't see the "Branch" column in the sales table, even though they manage multiple branches.

**Root Cause**: The branch column was conditionally rendered only for `admin`:
```javascript
{user.role === 'admin' && <th>Branch</th>}
```

**Solution**: Updated to show for both admin and branch_manager:
```javascript
{(user.role === 'admin' || user.role === 'branch_manager') && <th>Branch</th>}
```

### 2. Sales Page - Location Dropdown Not Working for Managers
**Issue**: The location dropdown in the "Record New Sale" form was disabled for managers.

**Root Cause**: The dropdown was disabled for anyone who wasn't admin AND had a location_id:
```javascript
disabled={user.role !== 'admin' && user.location_id}
```

**Solution**: Changed to only disable for staff and warehouse roles:
```javascript
disabled={user.role === 'branch_staff' || user.role === 'warehouse'}
```

### 3. Inventory Page - No Location Selector for Managers
**Issue**: Managers didn't see the "Select a Location" view that admins see. Instead, they were stuck viewing a single location.

**Root Cause**: The location selector UI was only shown for admin:
```javascript
{selectedLocation === 'all' && user.role === 'admin' ? (
```

**Solution**: Updated to show for both admin and branch_manager:
```javascript
{selectedLocation === 'all' && (user.role === 'admin' || user.role === 'branch_manager') ? (
```

Also updated the breadcrumb navigation to show for managers:
```javascript
{selectedLocation && selectedLocation !== 'all' && (user.role === 'admin' || user.role === 'branch_manager') && (
```

And updated the breadcrumb text to be role-aware:
```javascript
{user.role === 'admin' ? 'All Locations' : 'All My Branches'}
```

## Files Modified
1. `client/src/components/Sales.js`
   - Table header: Added branch column for managers
   - Table body: Show branch name for managers
   - Empty state colspan: Updated to account for branch column
   - Form location dropdown: Enabled for managers

2. `client/src/components/Inventory.js`
   - Breadcrumb navigation: Show for managers
   - Location selector view: Show for managers
   - Breadcrumb text: Role-aware ("All Locations" vs "All My Branches")

## Testing Checklist

### Sales Page (Manager Account)
- [ ] Location dropdown in filters shows "All My Branches" and all assigned branches
- [ ] Selecting a specific branch filters sales to that branch
- [ ] Sales table shows "Branch" column header
- [ ] Each sale row shows the branch name badge
- [ ] "Record New Sale" form has location dropdown enabled
- [ ] Can select any managed branch when recording a sale
- [ ] Pending cancellation requests section shows (if any exist)

### Inventory Page (Manager Account)
- [ ] Initial view shows "Select a Location" with all managed branches
- [ ] Can click on any branch to view its inventory
- [ ] Breadcrumb shows "← Back / All My Branches / [Branch Name]"
- [ ] Can switch between list and card view
- [ ] Clicking "Back" or "All My Branches" returns to location selector
- [ ] Cannot add inventory (shows info alert about using Transfers)

## Expected Behavior

### For Admin
- Sees ALL locations/branches
- Can add inventory directly
- Full edit/delete permissions
- Location dropdown shows "All Locations"

### For Branch Manager
- Sees only assigned branches (from "Manage Branches" in admin panel)
- Cannot add inventory (must use Transfers)
- Can approve transfers and cancellations
- Location dropdown shows "All My Branches"
- Has same view/filter capabilities as admin, but scoped to managed branches

### For Branch Staff
- Sees only their single assigned location
- View-only access
- Location dropdown is disabled
- Cannot approve anything

### For Warehouse
- Sees only their warehouse location
- Can add inventory
- Location dropdown is disabled

## Related Features
These fixes ensure managers have the same multi-branch view capabilities as admins, which is consistent with:
- Dashboard (already fixed to show all managed branches)
- Transfers page (already shows all managed branches)
- The "Manage Branches" feature in admin panel

## Next Steps
After verifying these fixes work correctly, the same pattern should be applied to:
- Reports page
- Deliveries page
- Discrepancy page

All these pages should show data from all managed branches for managers, not just the primary location.
