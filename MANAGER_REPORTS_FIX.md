# Manager Reports Page Improvements

## Overview
Completely redesigned the Reports page to provide a better user experience for admins and managers with multiple branches. Added branch selection interface and manager confirmation capabilities.

## New Features

### 1. Branch Selector for Multi-Branch Users
**For Admin and Managers with Multiple Branches:**
- Shows a branch selector screen by default
- Two view modes: **List View** and **Card View**
- Card view shows:
  - Branch name and type badge
  - Number of reports
  - Pending confirmation count (highlighted in orange)
- List view shows:
  - Tabular format with branch details
  - Report count per branch
  - "View Reports" button

### 2. Breadcrumb Navigation
- Shows when viewing a specific branch
- "← Back" button to return to branch selector
- Breadcrumb path: "All Branches / [Branch Name]" (admin) or "All My Branches / [Branch Name]" (manager)
- Click on breadcrumb links to navigate back

### 3. Manager Confirmation Capability
- Managers can now **confirm** reports from their branches
- Button shows "Confirm" for managers, "Approve" for admin
- Only admin can delete reports
- Managers see the same report details as admin

### 4. Filtered Location Data
- Reports are automatically filtered to the selected branch
- Managers only see branches they manage (via "Manage Branches")
- Staff see only their single assigned location

## Technical Changes

### Files Modified
- `client/src/components/Reports.js`

### Key Updates

#### 1. Added State Variables
```javascript
const [selectedLocation, setSelectedLocation] = useState('');
const [viewMode, setViewMode] = useState('list'); // 'list' or 'cards'
```

#### 2. Updated fetchLocations()
- Fetches manager's assigned branches via `/api/users/${user.id}/branches`
- Filters locations to only show managed branches for managers
- Sets `selectedLocation` to empty for multi-branch users (shows selector)
- Auto-selects location for single-branch users

#### 3. Updated getFilteredReports()
- Added filtering by `selectedLocation`
- Reports are scoped to the selected branch

#### 4. Added canConfirm Permission
```javascript
const canConfirm = user.role === 'admin' || user.role === 'branch_manager';
```

#### 5. Updated Action Buttons
- Changed from `user.role === 'admin'` to `canConfirm`
- Button text is role-aware: "Approve" (admin) vs "Confirm" (manager)
- Delete button remains admin-only

#### 6. Added Branch Selector UI
- Card view with hover effects
- List view with table format
- Toggle buttons for switching views
- Shows pending confirmation count per branch

#### 7. Added Breadcrumb Navigation
- Conditional rendering based on `selectedLocation`
- Role-aware text ("All Branches" vs "All My Branches")
- Back button functionality

## User Experience

### For Admin
1. Opens Reports page → sees branch selector (all branches)
2. Can toggle between list and card view
3. Clicks on a branch → sees reports for that branch
4. Can approve reports and delete them
5. Click "Back" or breadcrumb to return to branch selector

### For Manager with Multiple Branches
1. Opens Reports page → sees branch selector (only managed branches)
2. Can toggle between list and card view
3. Sees pending confirmation count on each branch card
4. Clicks on a branch → sees reports for that branch
5. Can **confirm** reports (same as approve, but different label)
6. Cannot delete reports
7. Click "Back" or breadcrumb to return to branch selector

### For Manager with Single Branch
1. Opens Reports page → directly shows reports for their branch
2. No branch selector (auto-selected)
3. Can confirm reports
4. Cannot delete reports

### For Staff
1. Opens Reports page → directly shows reports for their location
2. No branch selector
3. Can only view and submit reports
4. Cannot confirm or delete

## Benefits

### 1. Better Organization
- Clear separation of branches
- Easy to see which branches have pending reports
- Visual indicators for pending confirmations

### 2. Improved Navigation
- Intuitive back navigation
- Breadcrumb trail shows current location
- Toggle between view modes for preference

### 3. Manager Empowerment
- Managers can now confirm reports from their branches
- Reduces admin workload
- Faster report approval workflow

### 4. Consistent UX
- Matches the Inventory page pattern
- Same card/list view toggle
- Same breadcrumb navigation style

## Testing Checklist

### Admin Account
- [ ] Opens to branch selector showing all branches
- [ ] Can toggle between list and card view
- [ ] Card view shows report count and pending count
- [ ] Clicking a branch shows reports for that branch
- [ ] Breadcrumb shows "All Branches / [Branch Name]"
- [ ] Can approve reports (button says "Approve")
- [ ] Can delete reports
- [ ] Back button returns to branch selector

### Manager with 7 Branches
- [ ] Opens to branch selector showing only 7 managed branches
- [ ] Can toggle between list and card view
- [ ] Card view shows pending confirmation count
- [ ] Clicking a branch shows reports for that branch
- [ ] Breadcrumb shows "All My Branches / [Branch Name]"
- [ ] Can confirm reports (button says "Confirm")
- [ ] Cannot delete reports (no delete button)
- [ ] Back button returns to branch selector
- [ ] Filters work correctly

### Manager with 1 Branch
- [ ] Opens directly to reports (no branch selector)
- [ ] Shows reports for their single branch
- [ ] Can confirm reports
- [ ] Cannot delete reports

### Staff Account
- [ ] Opens directly to reports for their location
- [ ] No branch selector
- [ ] Can view and submit reports
- [ ] Cannot confirm or delete reports

## Related Features
This improvement makes the Reports page consistent with:
- Dashboard (shows all managed branches)
- Inventory (branch selector with card/list view)
- Sales (location filter for managers)
- Transfers (filtered to managed branches)

## Next Steps
After verifying this works correctly, apply similar patterns to:
- Deliveries page
- Discrepancy page

Both should show branch selectors for multi-branch managers and allow manager actions on their branches.
