# Transfer Approval Workflow System

## Overview

The system now implements a proper approval workflow for inventory transfers. This ensures proper authorization, tracking, and prevents unauthorized inventory movements.

---

## Roles & Permissions

### Admin
- **Full Control**
- Can add inventory to any location
- Can create transfers (auto-approved)
- Can approve/reject transfer requests
- Can ship transfers
- Can confirm deliveries
- Can edit/delete inventory
- Can cancel any transfer

### Warehouse Staff
- **Warehouse Operations**
- Can add inventory to their warehouse only
- Can create transfers from their warehouse (auto-approved)
- Can approve transfer requests from their warehouse
- Can ship approved transfers
- Cannot add inventory to branches
- Cannot confirm deliveries (branch does this)

### Branch Manager
- **Branch Operations**
- **CANNOT add inventory** (must request transfers)
- Can REQUEST transfers from warehouse
- Can record sales
- Can confirm delivery arrivals
- Can cancel their own pending requests
- Cannot approve transfers
- Cannot ship transfers

### Branch Staff
- **Limited Operations**
- Can record sales only
- Can view inventory
- Cannot request transfers
- Cannot manage inventory

---

## Transfer Workflow States

### 1. Pending
**Who Creates:** Branch Manager or Warehouse/Admin  
**What Happens:**
- Transfer request is created
- Inventory is NOT deducted yet
- Awaits approval from warehouse/admin

**Actions Available:**
- Approve (Warehouse/Admin)
- Reject (Warehouse/Admin)
- Cancel (Creator or Admin)

### 2. Approved
**Who Approves:** Warehouse Staff or Admin  
**What Happens:**
- Transfer is approved
- Inventory still NOT deducted
- Ready to be shipped

**Actions Available:**
- Ship (Warehouse/Admin) - moves to In Transit
- Cancel (Creator or Admin)

### 3. In Transit
**Who Ships:** Warehouse Staff or Admin  
**What Happens:**
- Inventory is DEDUCTED from source
- Items are physically shipped
- Awaits delivery confirmation

**Actions Available:**
- Confirm Delivery (Branch Manager or Admin)
- **Cannot cancel** (inventory already deducted)

### 4. Delivered
**Who Confirms:** Branch Manager or Admin  
**What Happens:**
- Inventory is ADDED to destination
- Transfer is complete
- Cannot be modified

**Actions Available:**
- None (final state)

### 5. Rejected
**Who Rejects:** Warehouse Staff or Admin  
**What Happens:**
- Transfer request is denied
- Inventory not affected
- Reason for rejection recorded

**Actions Available:**
- None (final state)

### 6. Cancelled
**Who Cancels:** Creator or Admin  
**What Happens:**
- Transfer is cancelled
- Only possible before shipping
- Inventory not affected

**Actions Available:**
- None (final state)

---

## Complete Workflows

### Workflow 1: Branch Requests Transfer from Warehouse

```
1. Branch Manager creates transfer request
   Status: PENDING
   Inventory: No change

2. Warehouse Staff reviews and approves
   Status: APPROVED
   Inventory: No change

3. Warehouse Staff ships the items
   Status: IN TRANSIT
   Inventory: DEDUCTED from warehouse

4. Branch Manager confirms arrival
   Status: DELIVERED
   Inventory: ADDED to branch

Result: Transfer complete, inventory moved
```

### Workflow 2: Warehouse Sends Transfer to Branch

```
1. Warehouse Staff creates transfer
   Status: APPROVED (auto-approved)
   Inventory: No change

2. Warehouse Staff ships the items
   Status: IN TRANSIT
   Inventory: DEDUCTED from warehouse

3. Branch Manager confirms arrival
   Status: DELIVERED
   Inventory: ADDED to branch

Result: Transfer complete, inventory moved
```

### Workflow 3: Admin Creates Transfer

```
1. Admin creates transfer
   Status: APPROVED (auto-approved)
   Inventory: No change

2. Admin (or Warehouse) ships the items
   Status: IN TRANSIT
   Inventory: DEDUCTED from source

3. Branch Manager (or Admin) confirms arrival
   Status: DELIVERED
   Inventory: ADDED to destination

Result: Transfer complete, inventory moved
```

### Workflow 4: Transfer Request Rejected

```
1. Branch Manager creates transfer request
   Status: PENDING
   Inventory: No change

2. Warehouse Staff reviews and rejects
   Status: REJECTED
   Inventory: No change
   Reason: "Insufficient stock" or other reason

Result: Transfer cancelled, no inventory movement
```

### Workflow 5: Transfer Cancelled Before Shipping

```
1. Branch Manager creates transfer request
   Status: PENDING
   Inventory: No change

2. Branch Manager cancels request
   Status: CANCELLED
   Inventory: No change

Result: Transfer cancelled, no inventory movement
```

---

## API Endpoints

### Create Transfer Request
```
POST /api/transfers
Body: {
  from_location_id, to_location_id, description, unit, quantity, unit_cost, notes
}
Returns: Transfer object with status 'pending' or 'approved'
```

### Approve Transfer
```
POST /api/transfers/:id/approve
Returns: Updated transfer with status 'approved'
```

### Reject Transfer
```
POST /api/transfers/:id/reject
Body: { rejection_reason }
Returns: Updated transfer with status 'rejected'
```

### Ship Transfer
```
POST /api/transfers/:id/ship
Returns: Updated transfer with status 'in_transit'
Action: DEDUCTS inventory from source
```

### Confirm Delivery
```
POST /api/transfers/:id/deliver
Returns: Updated transfer with status 'delivered'
Action: ADDS inventory to destination
```

### Cancel Transfer
```
POST /api/transfers/:id/cancel
Returns: Updated transfer with status 'cancelled'
Note: Only works if status is 'pending' or 'approved'
```

### Get All Transfers
```
GET /api/transfers
Query params: from_location_id, to_location_id, status, start_date, end_date
Returns: Array of transfers (filtered by user role)
```

### Get Pending Transfers
```
GET /api/transfers/pending
Returns: Array of pending transfers (for approval)
Access: Warehouse and Admin only
```

---

## Database Schema Changes

### New Columns in `transfers` table:

```sql
status VARCHAR(50) DEFAULT 'pending'
  - Values: pending, approved, in_transit, delivered, rejected, cancelled

approved_by INTEGER REFERENCES users(id)
  - Who approved the transfer

approved_at TIMESTAMP
  - When it was approved

delivered_by INTEGER REFERENCES users(id)
  - Who confirmed delivery

delivered_at TIMESTAMP
  - When delivery was confirmed

rejection_reason TEXT
  - Why transfer was rejected
```

---

## Inventory Movement Timeline

### Before Shipping:
```
Warehouse: 100 units
Branch: 50 units
Transfer: 30 units (pending/approved)

Actual Inventory:
- Warehouse: 100 units (no change)
- Branch: 50 units (no change)
```

### After Shipping (In Transit):
```
Warehouse: 100 units
Branch: 50 units
Transfer: 30 units (in_transit)

Actual Inventory:
- Warehouse: 70 units (deducted)
- Branch: 50 units (not added yet)
- In Transit: 30 units
```

### After Delivery:
```
Warehouse: 100 units
Branch: 50 units
Transfer: 30 units (delivered)

Actual Inventory:
- Warehouse: 70 units
- Branch: 80 units (added)
- In Transit: 0 units
```

---

## Business Rules

### 1. Inventory Addition
- **Admin**: Can add to any location
- **Warehouse**: Can add to their warehouse only
- **Branch Manager**: CANNOT add inventory (must request)
- **Branch Staff**: CANNOT add inventory

### 2. Transfer Creation
- **Admin**: Creates approved transfers
- **Warehouse**: Creates approved transfers from their warehouse
- **Branch Manager**: Creates pending transfer requests
- **Branch Staff**: CANNOT create transfers

### 3. Transfer Approval
- **Admin**: Can approve any transfer
- **Warehouse**: Can approve transfers from their warehouse
- **Branch Manager**: CANNOT approve transfers
- **Branch Staff**: CANNOT approve transfers

### 4. Transfer Shipping
- **Admin**: Can ship any transfer
- **Warehouse**: Can ship transfers from their warehouse
- **Branch Manager**: CANNOT ship transfers
- **Branch Staff**: CANNOT ship transfers

### 5. Delivery Confirmation
- **Admin**: Can confirm any delivery
- **Warehouse**: CANNOT confirm deliveries
- **Branch Manager**: Can confirm deliveries to their branch
- **Branch Staff**: CANNOT confirm deliveries

### 6. Transfer Cancellation
- **Creator**: Can cancel their own pending/approved transfers
- **Admin**: Can cancel any pending/approved transfer
- **Others**: Cannot cancel transfers
- **Note**: Cannot cancel in_transit or delivered transfers

---

## Error Prevention

### 1. Insufficient Inventory
- Checked when creating transfer
- Checked when approving transfer
- Checked when shipping transfer
- Clear error message with available quantity

### 2. Invalid Status Transitions
- Cannot ship pending transfer (must approve first)
- Cannot deliver non-shipped transfer
- Cannot cancel shipped transfer
- Clear error messages

### 3. Permission Checks
- User role validated for each action
- Location access validated
- Clear "Access denied" messages

### 4. Data Validation
- Item must exist in source inventory
- Quantity must be positive
- Source and destination must be different
- All required fields validated

---

## User Interface Changes

### For Branch Managers:
- "Request Transfer" button
- Shows transfer status badges
- Can confirm arrivals
- Can cancel pending requests
- Cannot add inventory (button hidden)

### For Warehouse Staff:
- "Create Transfer" button (auto-approved)
- "Pending Approvals" section
- Approve/Reject buttons
- Ship button for approved transfers
- Can add inventory to warehouse

### For Admin:
- Full access to all features
- Can perform any action
- Can add inventory anywhere
- Can override any status

---

## Status Badges (UI)

```
Pending: Orange badge
Approved: Blue badge
In Transit: Purple badge
Delivered: Green badge
Rejected: Red badge
Cancelled: Gray badge
```

---

## Migration Steps

### 1. Run Database Migration
```sql
-- File: server/database/update_transfer_workflow.sql
ALTER TABLE transfers 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS delivered_by INTEGER REFERENCES users(id);

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

-- Update existing transfers
UPDATE transfers SET status = 'delivered' WHERE status IS NULL;
```

### 2. Deploy Backend
- Updated routes deployed to Railway
- Automatic deployment on push

### 3. Deploy Frontend
- Updated components deployed to Vercel
- Automatic deployment on push

### 4. Test Workflow
- Create test transfer request
- Approve transfer
- Ship transfer
- Confirm delivery
- Verify inventory updates

---

## Benefits

### 1. Proper Authorization
- Only authorized users can perform actions
- Clear permission structure
- Audit trail for all actions

### 2. Inventory Accuracy
- Inventory deducted only when shipped
- Inventory added only when confirmed
- No phantom inventory
- Clear tracking of in-transit items

### 3. Accountability
- Who requested transfer
- Who approved transfer
- Who shipped transfer
- Who confirmed delivery
- Complete audit trail

### 4. Flexibility
- Can cancel before shipping
- Can reject requests
- Can track status
- Clear workflow

### 5. Error Prevention
- Cannot oversell
- Cannot over-transfer
- Validation at each step
- Clear error messages

---

## Best Practices

### For Branch Managers:
1. Request transfers in advance
2. Confirm deliveries promptly
3. Check inventory before requesting
4. Add notes for clarity

### For Warehouse Staff:
1. Review requests daily
2. Approve/reject promptly
3. Ship approved transfers quickly
4. Add inventory regularly

### For Admin:
1. Monitor pending requests
2. Review rejected transfers
3. Check in-transit items
4. Audit completed transfers

---

## Troubleshooting

### Transfer stuck in Pending
- Check if warehouse staff reviewed it
- Contact warehouse for approval
- Admin can approve if urgent

### Transfer stuck in Approved
- Warehouse needs to ship it
- Check if items are ready
- Admin can ship if needed

### Transfer stuck in In Transit
- Branch needs to confirm arrival
- Check if items arrived
- Admin can confirm if needed

### Cannot create transfer
- Check if item exists in source
- Verify sufficient quantity
- Check user permissions
- Verify locations are different

---

## Summary

The new workflow ensures:
- Proper authorization at each step
- Accurate inventory tracking
- Complete audit trail
- Error prevention
- Clear responsibilities
- Flexible cancellation
- Real-time status tracking

Branch managers can now only REQUEST transfers, not add inventory directly. This ensures all inventory movements are properly authorized and tracked!
