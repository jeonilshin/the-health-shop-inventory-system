# Dashboard Manager Multi-Branch Fix

## Problem
The Dashboard page was only showing 1 branch for managers instead of all 7 assigned branches in the "Inventory by Location" section. The issue was that the dashboard was filtering data based on the manager's primary `location_id` field instead of fetching all branches assigned via the `manager_branches` table.

## Root Cause
In `client/src/components/Dashboard.js`, the `fetchData()` function was using:
```javascript
const isBranch = user.role === 'branch_manager' || user.role === 'branch_staff';
const filteredSummary = isBranch
  ? summaryRes.data.filter(i => i.location_id === user.location_id)
  : summaryRes.data;
```

This logic only checked the primary `location_id` field, which is set in the "Edit User" form under "Assigned Location". However, for managers with multiple branches, the branches are stored in the `manager_branches` table and accessed via the "Manage Branches" button in the admin panel.

## Solution Applied

### 1. Fetch Manager's Assigned Branches
Added API call to fetch all branches assigned to the manager:
```javascript
// For branch managers, get all their managed branches
let managerLocationIds = [];
if (user.role === 'branch_manager') {
  try {
    const managerBranchesRes = await api.get(`/users/${user.id}/branches`);
    managerLocationIds = managerBranchesRes.data.map(b => b.location_id);
    // Include primary location too
    managerLocationIds = [...new Set([user.location_id, ...managerLocationIds])];
  } catch (error) {
    // Fallback to primary location only
    managerLocationIds = [user.location_id];
  }
}
```

### 2. Updated Filtering Logic
Changed the filtering to distinguish between staff (single location) and managers (multiple locations):
```javascript
const isBranchStaff = user.role === 'branch_staff';
const isBranchManager = user.role === 'branch_manager';

const filteredSummary = isBranchStaff
  ? summaryRes.data.filter(i => i.location_id === user.location_id)
  : isBranchManager
  ? summaryRes.data.filter(i => managerLocationIds.includes(i.location_id))
  : summaryRes.data;
```

This same logic was applied to:
- `filteredSummary` (Inventory by Location section)
- `filteredLowStock` (Low Stock Alert section)
- `filteredExpiring` (Expiring Items section)

### 3. Updated Page Subtitle
Changed the subtitle to show the number of managed branches for managers:
```javascript
{user?.role === 'branch_manager' && summary.length > 0 && (
  <span style={{ marginLeft: '8px', color: 'var(--primary)', fontWeight: 600 }}>
    · Managing {summary.length} branch{summary.length !== 1 ? 'es' : ''}
  </span>
)}
```

## Files Modified
- `client/src/components/Dashboard.js`

## Testing
After this fix, when a manager logs in:
1. The Dashboard will fetch all branches assigned via the "Manage Branches" button
2. The "Inventory by Location" section will show all 7 branches (or however many are assigned)
3. The page subtitle will show "Managing 7 branches" instead of showing a single branch name
4. Low stock and expiring items will also be filtered to show data from all managed branches

## Reference Implementation
This fix follows the same pattern used in `client/src/components/Inventory.js` which correctly fetches and displays all managed branches for managers.

## API Endpoint Used
- `GET /api/users/:id/branches` - Returns all branches assigned to a manager via the `manager_branches` table

## Next Steps
After verifying the Dashboard works correctly, the same pattern should be applied to:
- Reports page
- Deliveries page  
- Discrepancy page

These pages should also show data from all managed branches, not just the primary location.
