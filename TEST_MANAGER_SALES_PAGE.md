# Testing Manager Sales Page - Pending Cancellations

## Changes Made:

### Backend (`server/routes/sales-transactions.js`):

1. ✅ **Updated `/pending-cancellations` endpoint**
   - Changed from `authorize('admin')` to `authorize('admin', 'branch_manager')`
   - Added filtering for managers to only see cancellations from their managed branches
   - Uses `getManagerLocations()` to get all managed branch IDs

2. ✅ **Updated `/cancel/approve` endpoint**
   - Changed from `authorize('admin')` to `authorize('admin', 'branch_manager')`
   - Added location access check for managers using `hasLocationAccess()`

3. ✅ **Updated `/cancel/reject` endpoint**
   - Changed from `authorize('admin')` to `authorize('admin', 'branch_manager')`
   - Added location access check for managers using `hasLocationAccess()`

### Frontend (`client/src/components/Sales.js`):

1. ✅ **Updated `fetchPendingCancellations` calls**
   - Changed from `user.role === 'admin'` to `user.role === 'admin' || user.role === 'branch_manager'`
   - Added console logging for debugging

2. ✅ **Updated pending cancellations section visibility**
   - Changed from `user.role === 'admin'` to `(user.role === 'admin' || user.role === 'branch_manager')`

3. ✅ **Updated location dropdown**
   - Shows for both admin and branch_manager
   - Text changes to "All My Branches" for managers

4. ✅ **Updated `fetchLocations`**
   - Fetches manager's assigned branches via `/api/users/:id/branches`
   - Filters locations to only show managed branches

## Testing Steps:

### 1. **Restart Your Server**
```bash
# Stop the server (Ctrl+C)
# Start it again
npm start
```

### 2. **Create a Test Cancellation Request**

As a **branch staff** user:
1. Go to `/sales` page
2. Find a sale from your branch
3. Click "Request Cancellation"
4. Enter a reason
5. Submit

### 3. **Login as Manager**

Login with a manager account that manages the branch where the cancellation was requested.

### 4. **Check Sales Page**

1. Go to `/sales` page
2. Open browser console (F12)
3. Look for these console messages:
   ```
   [Sales] Fetching pending cancellations for role: branch_manager
   [Sales] Pending cancellations received: X
   ```

4. You should see:
   - ✅ "Pending Sale Cancellation Requests" section at the top
   - ✅ The cancellation request in the table
   - ✅ "Approve" and "Reject" buttons

### 5. **Test Approve/Reject**

1. Click "Approve" on a cancellation
   - Should show success message
   - Cancellation should disappear from pending list

2. Create another cancellation and click "Reject"
   - Should prompt for a reason
   - Enter reason and confirm
   - Cancellation should disappear from pending list

## Troubleshooting:

### If you don't see the section:

1. **Check Console Logs**
   - Look for `[Sales] Fetching pending cancellations`
   - Check if there are any errors

2. **Check if there are pending cancellations**
   - Make sure you created a cancellation request first
   - Check that the manager manages the branch where the cancellation was created

3. **Check Manager's Assigned Branches**
   - Go to Admin panel
   - Check the manager's profile
   - Verify they are assigned to the branch

4. **Check Backend Logs**
   - Look at your server console
   - Check for any errors when calling `/sales-transactions/pending-cancellations`

### If you get 403 Forbidden:

- The manager might not be assigned to that branch
- Check `/api/users/:id/branches` returns the correct branches
- Verify `manager_branches` table has the correct data

### If you get 401 Unauthorized:

- The endpoint might still have `authorize('admin')` only
- Double-check the changes were saved in `server/routes/sales-transactions.js`
- Restart the server

## Expected Behavior:

✅ **For Managers:**
- See "Pending Sale Cancellation Requests" section
- Only see cancellations from their managed branches
- Can approve/reject cancellations
- Location dropdown shows "All My Branches"

✅ **For Admin:**
- See all pending cancellations from all branches
- Can approve/reject any cancellation
- Location dropdown shows "All Branches"

✅ **For Branch Staff:**
- Cannot see pending cancellations section
- Can only request cancellations
- No location dropdown (only their branch)
