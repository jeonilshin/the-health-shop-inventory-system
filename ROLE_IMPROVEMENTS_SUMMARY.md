# Role Management Improvements

## Overview
This update enhances the role management system to provide more flexibility and proper permissions for managers and staff.

## Key Changes

### 1. Multi-Branch Manager Support
- **New Feature**: Managers can now be assigned to multiple branches
- **Database**: New `manager_branches` junction table
- **API Endpoints**:
  - `GET /users/:id/branches` - Get manager's assigned branches
  - `POST /users/:id/branches` - Assign manager to a branch (admin only)
  - `DELETE /users/:id/branches/:location_id` - Remove manager from branch (admin only)

### 2. Manager Approval Powers
- **Transfer Approvals**: Managers can now approve staff transfer requests from their managed branches
- **Delivery Confirmations**: Managers can confirm staff delivery acceptances
- **Workflow**: Staff → Manager → Admin (for transfers)

### 3. Staff Permissions Enhanced
- **Create Transfers**: Staff can now create transfer requests (requires manager approval)
- **Accept Deliveries**: Staff can accept deliveries (requires manager confirmation)
- **Access**: Staff can view Transfers and Deliveries pages

## Database Migrations

### Required Migrations (Run in order):
1. `server/database/multi_branch_managers.sql` - Creates manager_branches table
2. `server/database/staff_transfer_permissions.sql` - Adds approval tracking fields

### Migration Commands:
```bash
# Run migrations
psql -U your_username -d your_database -f server/database/multi_branch_managers.sql
psql -U your_username -d your_database -f server/database/staff_transfer_permissions.sql
```

## New Workflows

### Transfer Creation by Staff:
1. Staff creates transfer request
2. Manager of source branch approves
3. Admin gives final approval
4. Warehouse ships
5. Branch receives

### Delivery Acceptance by Staff:
1. Admin confirms delivery
2. Staff accepts delivery
3. Manager confirms acceptance
4. Inventory updated, transfer completed

### Manager Multi-Branch Management:
1. Admin assigns manager to multiple branches
2. Manager can approve requests from any assigned branch
3. Manager sees transfers/deliveries for all managed branches

## API Changes

### New Endpoints:
- `POST /transfers/:id/manager-approve` - Manager approves staff transfer
- `POST /deliveries/:id/manager-confirm` - Manager confirms staff delivery acceptance
- `GET /users/:id/branches` - Get manager's branches
- `POST /users/:id/branches` - Assign manager to branch
- `DELETE /users/:id/branches/:location_id` - Remove manager from branch

### Updated Endpoints:
- `POST /transfers` - Now accepts `branch_staff` role
- `POST /transfers/:id/approve` - Now accepts `branch_manager` role (for staff transfers)
- `POST /deliveries/:id/accept` - Now accepts `branch_staff` role

### New Authorization Helper Functions:
- `hasLocationAccess(userId, userRole, locationId)` - Check if user has access to location
- `getManagerLocations(userId, userRole)` - Get all locations a manager can access

## Frontend Changes

### Navigation:
- Staff can now see "Transfers" and "Deliveries" menu items

### Transfer Page:
- Staff can create transfer requests
- Managers see pending staff transfers for approval
- Shows approval status (pending manager/admin)

### Delivery Page:
- Staff can accept deliveries
- Managers see pending confirmations
- Shows confirmation status

## Security & Permissions

### Role Hierarchy:
- **Admin**: Full access, final approvals
- **Manager**: Multi-branch access, approves staff requests
- **Staff**: Can create transfers and accept deliveries (with manager confirmation)
- **Warehouse**: Ships approved transfers

### Access Control:
- Managers checked against both `location_id` and `manager_branches` table
- Staff restricted to their assigned branch only
- All approvals logged in audit trail

## Testing Checklist

### Multi-Branch Managers:
- [ ] Admin can assign manager to multiple branches
- [ ] Admin can remove manager from branches
- [ ] Manager can see transfers from all managed branches
- [ ] Manager can approve transfers from any managed branch

### Staff Transfers:
- [ ] Staff can create transfer request
- [ ] Manager receives notification
- [ ] Manager can approve staff transfer
- [ ] Admin receives notification after manager approval
- [ ] Admin can approve after manager approval
- [ ] Transfer cannot be admin-approved without manager approval

### Staff Deliveries:
- [ ] Staff can accept delivery
- [ ] Manager receives notification
- [ ] Manager can confirm delivery acceptance
- [ ] Inventory updated after manager confirmation
- [ ] Transfer marked as completed

## Rollback Plan

If issues occur, you can rollback by:

1. Remove new columns:
```sql
ALTER TABLE transfers DROP COLUMN IF EXISTS requires_manager_approval;
ALTER TABLE transfers DROP COLUMN IF EXISTS manager_approved_by;
ALTER TABLE transfers DROP COLUMN IF EXISTS manager_approved_at;
ALTER TABLE deliveries DROP COLUMN IF EXISTS requires_manager_approval;
ALTER TABLE deliveries DROP COLUMN IF EXISTS manager_confirmed_by;
ALTER TABLE deliveries DROP COLUMN IF EXISTS manager_confirmed_at;
DROP TABLE IF EXISTS manager_branches;
```

2. Restore previous code from git:
```bash
git checkout HEAD~1 server/routes/transfers.js
git checkout HEAD~1 server/routes/deliveries.js
git checkout HEAD~1 server/routes/users.js
git checkout HEAD~1 server/middleware/auth.js
git checkout HEAD~1 client/src/components/Navbar.js
```

## Notes

- All existing transfers and deliveries continue to work as before
- Managers with only one branch work exactly as before
- Staff role now has more capabilities but still requires manager oversight
- All actions are logged in the audit trail
- Notifications sent at each approval stage
