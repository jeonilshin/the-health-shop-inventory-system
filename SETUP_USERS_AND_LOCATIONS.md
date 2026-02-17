# Setup Guide: Users and Locations

## Problem: Empty Dropdowns and Missing Branch Names

If you're seeing:
- ❌ Empty branch dropdown in Sales
- ❌ Empty location dropdown in Inventory
- ❌ No branch name showing for branch managers/staff

**Root Cause**: Users (warehouse, branch_manager, branch_staff) don't have `location_id` assigned.

---

## Solution: Assign Users to Locations

### Step 1: Check Current Setup

Run this in your Neon database console:

```sql
-- See which users need location assignment
SELECT id, username, full_name, role, location_id 
FROM users 
WHERE role IN ('warehouse', 'branch_manager', 'branch_staff');

-- See available locations
SELECT id, name, type FROM locations ORDER BY type, name;
```

### Step 2: Assign Users to Locations

**Example 1: Assign warehouse user to warehouse**
```sql
-- Replace 2 with your warehouse user ID
-- Replace 1 with your warehouse location ID
UPDATE users SET location_id = 1 WHERE id = 2 AND role = 'warehouse';
```

**Example 2: Assign branch manager to branch**
```sql
-- Replace 3 with your branch manager user ID
-- Replace 5 with your branch location ID
UPDATE users SET location_id = 5 WHERE id = 3 AND role = 'branch_manager';
```

**Example 3: Assign branch staff to branch**
```sql
-- Replace 4 with your branch staff user ID
-- Replace 5 with your branch location ID (same as manager)
UPDATE users SET location_id = 5 WHERE id = 4 AND role = 'branch_staff';
```

### Step 3: Verify Changes

```sql
SELECT u.id, u.username, u.full_name, u.role, u.location_id, 
       l.name as location_name, l.type
FROM users u
LEFT JOIN locations l ON u.location_id = l.id
WHERE u.role IN ('warehouse', 'branch_manager', 'branch_staff')
ORDER BY u.role, u.username;
```

You should see location names filled in for all users.

---

## Creating Users with Locations (Proper Way)

When creating new users in the Admin panel:

### For Warehouse Staff:
1. Go to Admin → Users tab
2. Click "Add User"
3. Fill in details:
   - Username: `warehouse1`
   - Password: (set password)
   - Full Name: `John Warehouse`
   - Role: `warehouse`
   - **Location: Select your warehouse** ← IMPORTANT!
4. Click "Add User"

### For Branch Manager:
1. Go to Admin → Users tab
2. Click "Add User"
3. Fill in details:
   - Username: `manager_branch1`
   - Password: (set password)
   - Full Name: `Jane Manager`
   - Role: `branch_manager`
   - **Location: Select the branch** ← IMPORTANT!
4. Click "Add User"

### For Branch Staff:
1. Go to Admin → Users tab
2. Click "Add User"
3. Fill in details:
   - Username: `staff_branch1`
   - Password: (set password)
   - Full Name: `Bob Staff`
   - Role: `branch_staff`
   - **Location: Select the branch** ← IMPORTANT!
4. Click "Add User"

---

## What's Fixed Now

### 1. ✅ Branch Name Display
- **Navbar**: Shows "@ Branch Name" next to user info
- **Dashboard**: Shows branch name in welcome message for branch managers/staff

### 2. ✅ Better Error Messages
- **Sales**: Shows alert if user not assigned to branch
- **Sales**: Shows alert if no branches exist
- **Inventory**: Shows alert if user not assigned to location
- **Inventory**: Shows alert if no locations exist

### 3. ✅ Auto-Selection
- Branch managers/staff automatically have their branch selected in forms
- Warehouse staff automatically have their warehouse selected

---

## Testing After Setup

### Test as Branch Manager:
1. Login as branch manager
2. Check navbar → Should show "@ Your Branch Name"
3. Go to Dashboard → Should show branch name in welcome
4. Go to Sales → Branch should be pre-selected
5. Try recording a sale → Should work!

### Test as Warehouse Staff:
1. Login as warehouse user
2. Check navbar → Should show "@ Your Warehouse Name"
3. Go to Inventory → Warehouse should be pre-selected
4. Try adding inventory → Should work!

### Test as Admin:
1. Login as admin
2. Go to Sales → Should see all branches in dropdown
3. Go to Inventory → Should see all locations in dropdown
4. Can select any location

---

## Quick Reference: User Roles

| Role | Location Required? | Can See |
|------|-------------------|---------|
| Admin | No | All locations |
| Warehouse | Yes (warehouse) | Their warehouse only |
| Branch Manager | Yes (branch) | Their branch only |
| Branch Staff | Yes (branch) | Their branch only |

---

## Still Having Issues?

### Issue: "No locations found" alert
**Solution**: Create locations first in Admin → Locations tab

### Issue: User still can't see their location
**Solution**: 
1. Logout and login again
2. Check database that location_id is set correctly
3. Verify location exists in locations table

### Issue: Dropdown still empty
**Solution**:
1. Open browser console (F12)
2. Check for API errors
3. Verify backend is running
4. Check network tab for failed requests

---

## SQL Helper Script

Use this file for all SQL commands: `server/database/fix_user_locations.sql`

It includes:
- Check queries
- Example update queries
- Verification queries

Just update the IDs to match your database!
