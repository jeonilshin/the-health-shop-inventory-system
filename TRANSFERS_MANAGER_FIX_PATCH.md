# Transfers Manager Fix - Required Changes

## Issue
1. Managers cannot see "Pending Approvals" section
2. Managers only see transfers from their primary location, not all managed branches

## Required Changes

### File: `server/routes/transfers.js`

**Location: Line ~1082-1090 (in the `router.get('/', auth, async (req, res) => {` function)**

**REPLACE THIS:**
```javascript
    // Filter by user role and location
    if (req.user.role === 'branch_manager') {
      query += ` AND (t.from_location_id = ${paramCount} OR t.to_location_id = ${paramCount})`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (req.user.role === 'warehouse') {
      query += ` AND t.from_location_id = ${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    }
```

**WITH THIS:**
```javascript
    // Filter by user role and location
    if (req.user.role === 'branch_manager') {
      // Get all managed branches for the manager
      const { getManagerLocations } = require('../middleware/auth');
      const managerLocations = await getManagerLocations(req.user.id, req.user.location_id);
      
      if (managerLocations.length > 0) {
        query += ` AND (t.from_location_id = ANY($${paramCount}) OR t.to_location_id = ANY($${paramCount}))`;
        params.push(managerLocations);
        paramCount++;
      } else {
        // Manager has no branches assigned, return empty
        return res.json([]);
      }
    } else if (req.user.role === 'warehouse') {
      query += ` AND t.from_location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    }
```

---

### File: `client/src/components/Transfers.js`

**Location: Line ~604-620 (in the `getFilteredTransfers` function)**

**REPLACE THIS:**
```javascript
  const getFilteredTransfers = () => {
    let filtered = transfers.filter(transfer => {
      // For admin, exclude pending transfers from history
      if (user.role === 'admin' && transfer.status === 'pending') {
        return false;
      }
      
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
      
      return true;
    });
```

**WITH THIS:**
```javascript
  const getFilteredTransfers = () => {
    let filtered = transfers.filter(transfer => {
      // For admin and managers, exclude pending transfers from history (they go in Pending Approvals section)
      if ((user.role === 'admin' || user.role === 'branch_manager') && transfer.status === 'pending') {
        return false;
      }
      
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
      
      return true;
    });
```

---

## What These Changes Do

### Backend Change (`server/routes/transfers.js`):
- **Before**: Managers only saw transfers from/to their primary `location_id`
- **After**: Managers see transfers from/to ALL their managed branches (from `manager_branches` table)
- Uses `getManagerLocations()` helper function to get all assigned branches
- Uses PostgreSQL `ANY()` operator to check if transfer involves any of the manager's branches

### Frontend Change (`client/src/components/Transfers.js`):
- **Before**: Only admin had pending transfers excluded from main list
- **After**: Both admin AND managers have pending transfers excluded from main list
- This ensures pending transfers only show in the "Pending Approvals" section, not in the main transfer history

## Result
- ✅ Managers will see "Pending Approvals" section with pending transfers
- ✅ Managers will see ALL transfers from their managed branches, not just primary location
- ✅ Transfer list will no longer be "cut off" for managers
- ✅ Pending transfers appear in correct section, not mixed with history

## How to Apply

1. Open `server/routes/transfers.js`
2. Find line ~1082 (search for "Filter by user role and location")
3. Replace the manager section as shown above
4. Open `client/src/components/Transfers.js`
5. Find line ~604 (search for "getFilteredTransfers")
6. Update the condition to include `user.role === 'branch_manager'`
7. Save both files
8. Restart the server

## Testing
- Login as manager
- Go to `/transfers` page
- Should see "Pending Approvals" section if there are pending transfers
- Should see all transfers from ALL managed branches, not just primary location
