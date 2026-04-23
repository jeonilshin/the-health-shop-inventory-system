# Fix getManagerLocations Issue - Complete

## Date: April 23, 2026

## Issue
Manager accounts got database error when accessing `/transfers` page:
```
invalid input syntax for type integer: "{"id":42,"name":"THS - Davao Gaisano Mall"...}"
```

## Root Cause
The `getManagerLocations()` function in `server/middleware/auth.js` returns **full location objects** with all fields (id, name, type, address, etc.), but the SQL queries expected an **array of location IDs** (integers).

When the code tried to use these objects in SQL queries like:
```sql
WHERE location_id = ANY($1)
```

PostgreSQL expected `$1` to be `[1, 2, 3]` but got `[{id: 1, name: "..."}, {id: 2, name: "..."}, ...]`

## Solution
Extract just the IDs from the location objects before passing to SQL queries:

```javascript
// Before (BROKEN)
const managerLocations = await getManagerLocations(req.user.id, req.user.location_id);
const result = await pool.query(query, [managerLocations]); // ❌ Passing objects

// After (FIXED)
const managerLocations = await getManagerLocations(req.user.id, req.user.role);
const locationIds = managerLocations.map(loc => loc.id); // ✅ Extract IDs
const result = await pool.query(query, [locationIds]); // ✅ Passing integers
```

## Files Modified

### 1. `server/routes/transfers.js`
- **Line ~1082**: Main transfers GET endpoint - extract IDs before SQL query
- **Line ~1198**: Pending transfers endpoint - extract IDs before SQL query
- Also fixed: Pass `req.user.role` instead of `req.user.location_id` to `getManagerLocations()`

### 2. `server/routes/counts.js`
- **Line ~30**: Transfers count for managers - extract IDs before SQL query
- **Line ~78**: Sale cancellations count for managers - extract IDs before SQL query
- Also fixed: Pass `req.user.role` instead of `req.user.location_id` to `getManagerLocations()`

## Changes Made

### Pattern Applied Everywhere:
```javascript
// Get manager locations (returns objects)
const { getManagerLocations } = require('../middleware/auth');
const managerLocations = await getManagerLocations(req.user.id, req.user.role);

if (managerLocations.length > 0) {
  // Extract just the IDs from the location objects
  const locationIds = managerLocations.map(loc => loc.id);
  
  // Use locationIds in SQL query
  const result = await pool.query(
    `SELECT * FROM table WHERE location_id = ANY($1)`,
    [locationIds]
  );
}
```

## Why Not Change getManagerLocations()?
We kept `getManagerLocations()` returning full objects because:
1. Other parts of the code might need the full location details (name, type, etc.)
2. Safer to fix at the call site than change a shared utility function
3. More explicit - you can see exactly what's being passed to SQL

## Testing
- [x] Manager can access `/transfers` page
- [x] Manager sees pending approvals
- [x] Manager sees transfer history from all managed branches
- [x] Navbar badges show correct counts for managers
- [x] No more "invalid input syntax for type integer" errors

## Result
✅ Managers can now access `/transfers` page without errors
✅ All manager features work correctly
✅ Pending approvals section displays properly
✅ Transfer list shows all managed branches

## Related Issues Fixed
- Transfers manager fixes (TRANSFERS_MANAGER_COMPLETE_FIX.md)
- Transfers approval fixes (TRANSFERS_APPROVAL_FIXES.md)
- Inventory manager fixes (INVENTORY_MANAGER_FIXES_COMPLETE.md)
