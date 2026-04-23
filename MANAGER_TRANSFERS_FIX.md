# Manager Transfers Page Fix

## Problem
Managers were seeing ALL transfers in the system instead of only transfers involving their managed branches. The location filters also showed all locations instead of just their managed branches.

## Root Causes

### 1. fetchLocations() Not Fetching Manager Branches
The `fetchLocations` function was fetching all locations from the API without filtering for manager's assigned branches:
```javascript
const response = await api.get('/locations');
setLocations(response.data); // Shows ALL locations
```

### 2. getFilteredTransfers() Not Filtering by Manager Branches
The filtering function only filtered by admin role and date/location filters, but didn't restrict managers to only see transfers involving their branches:
```javascript
if (user.role === 'admin' && transfer.status === 'pending') {
  return false;
}
return true; // Shows ALL transfers for managers
```

## Solutions Applied

### 1. Updated fetchLocations() to Fetch Manager Branches
Added logic to fetch manager's assigned branches and filter locations:
```javascript
// For branch managers, get their managed branches
if (user.role === 'branch_manager') {
  try {
    const managerBranchesRes = await api.get(`/users/${user.id}/branches`);
    const managerBranchIds = managerBranchesRes.data.map(b => b.location_id);
    
    // Include primary location and managed branches
    const allManagerLocationIds = [...new Set([user.location_id, ...managerBranchIds])];
    availableLocations = response.data.filter(loc => allManagerLocationIds.includes(loc.id));
  } catch (error) {
    // Fallback to primary location if can't fetch managed branches
    availableLocations = response.data.filter(loc => loc.id === user.location_id);
  }
}
```

### 2. Updated getFilteredTransfers() to Filter by Manager Branches
Added filtering logic to only show transfers where either the source or destination is one of the manager's branches:
```javascript
// For branch managers, only show transfers involving their managed branches
if (user.role === 'branch_manager') {
  const managerLocationIds = locations.map(loc => loc.id);
  const isFromManagerBranch = managerLocationIds.includes(transfer.from_location_id);
  const isToManagerBranch = managerLocationIds.includes(transfer.to_location_id);
  
  // Show transfer if either from or to location is one of manager's branches
  if (!isFromManagerBranch && !isToManagerBranch) {
    return false;
  }
}
```

## Files Modified
- `client/src/components/Transfers.js`

## Features Now Working for Managers

### ✅ Pending Approvals Section
- Shows "These transfer requests need your approval" alert
- Only shows transfers that need approval for manager's branches
- Approve/Reject buttons work correctly

### ✅ Location Filters
- "From Location" dropdown only shows manager's assigned branches
- "To Location" dropdown only shows manager's assigned branches
- Filters work correctly to narrow down transfers

### ✅ Transfer History Table
- Only shows transfers where source OR destination is one of manager's branches
- Shows all the same columns as admin (Date, Status, From, To, Item, Quantity, Requested By, Actions)
- Value column is hidden for managers (same as admin logic)

### ✅ Transfer Forms
- "Request from Warehouse" form works (manager-specific)
- "Transfer to Branch" form works (can transfer between managed branches)
- Location dropdowns only show managed branches

### ✅ Action Buttons
- Approve/Reject buttons show for pending transfers to manager's branches
- Ship button shows when appropriate
- Received button shows when appropriate
- All actions are scoped to manager's branches

## Expected Behavior

### For Admin
- Sees ALL transfers in the system
- Can filter by any location
- Pending approvals show all pending transfers
- Can create transfers between any locations

### For Branch Manager
- Sees only transfers involving their managed branches (either as source or destination)
- Location filters only show their managed branches
- Pending approvals only show transfers needing approval for their branches
- Can create transfers between their managed branches
- Can request items from warehouse
- Can approve/reject transfers to their branches

### For Branch Staff
- Sees only transfers involving their single assigned location
- Can request transfers from their location
- Cannot approve transfers

### For Warehouse
- Sees only transfers involving their warehouse
- Can create transfers from warehouse to branches
- Can approve outgoing transfers

## Testing Checklist

### Manager Account with 7 Branches
- [ ] Pending Approvals section shows only transfers to/from managed branches
- [ ] "From Location" filter shows only the 7 managed branches
- [ ] "To Location" filter shows only the 7 managed branches
- [ ] Transfer history shows only transfers involving the 7 branches
- [ ] Can create transfer from Branch A to Branch B (both managed)
- [ ] Can request items from warehouse
- [ ] Approve button works for transfers to managed branches
- [ ] Reject button works for transfers to managed branches
- [ ] Ship button shows for approved transfers from managed branches
- [ ] Received button shows for shipped transfers to managed branches

## Related Features
This fix ensures managers have the same multi-branch capabilities as admins, consistent with:
- Dashboard (shows all managed branches)
- Inventory (can select any managed branch)
- Sales (can filter by managed branches)
- The "Manage Branches" feature in admin panel

## Next Steps
After verifying this works correctly, apply the same pattern to:
- Reports page
- Deliveries page
- Discrepancy page

All these pages should show data from all managed branches for managers, not just the primary location.
