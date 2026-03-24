# Discrepancy Management System

## Overview
The discrepancy system handles two types of inventory issues:
1. **Shortage Reports** - When a branch receives fewer items than expected
2. **Return Requests** - When a branch needs to send items back to the warehouse

## Features

### 1. Shortage Reports
**Use Case:** Branch received 30 boxes but only got 29

**How it works:**
- Branch reports the shortage through the delivery page
- Selects the item from the delivery
- Enters the actual quantity received (e.g., 29)
- System calculates the missing amount (e.g., 1 box)
- Admin reviews and approves/rejects

**When Approved:**
- Missing quantity is added back to the warehouse
- Branch inventory remains unchanged (they already have the correct amount)
- Example: If expected 30 but received 29, warehouse gets +1 box back

### 2. Return Requests
**Use Case:** Branch has broken bottles or wrong items to return

**How it works:**
- Branch manager creates a return request
- Enters item description, unit, and quantity to return
- Selects which warehouse to return to
- Provides a reason/note
- Admin reviews and approves/rejects

**When Approved:**
- Quantity is removed from branch inventory
- Quantity is added to the warehouse
- Example: Return 5 broken bottles → branch -5, warehouse +5

## User Interface

### For Branch Managers/Staff
1. **Deliveries Page** (`/deliveries`)
   - "Report Shortage" button on delivered items
   - "Request Return to Warehouse" button at top
   - View their own discrepancy history

2. **Discrepancy Page** (`/discrepancy`)
   - View all shortage and return records
   - Grouped by date (newest first)
   - Filter by type (shortage/return) and status (pending/approved/rejected)
   - Shows:
     - Date grouping (e.g., "March 1, 2026")
     - Item name and quantity
     - Type badge (Shortage/Return)
     - Status badge (Pending/Approved/Rejected)
     - Notes and admin responses

### For Admins
1. **Deliveries Page** (`/deliveries`)
   - Pending requests section at top
   - Shows all pending shortages and returns
   - Quick approve/reject actions
   - Can add admin notes when rejecting

2. **Discrepancy Page** (`/discrepancy`)
   - View all discrepancies from all branches
   - Filter and search capabilities
   - See which branch reported each issue

## Navigation
- **Branch Manager/Staff:** Dashboard → Discrepancy (in sidebar)
- **Admin:** Dashboard → Deliveries (for approvals) or Discrepancy (for history)

## Date Grouping Display
The Discrepancy page groups items by date:

```
March 1, 2026 (3 items)
  - Bot 1 - Return - 1× bottle - Approved
  - Bot 2 - Shortage - 4× box - Pending
  - Bot 3 - Return - 2× pcs - Rejected

March 2, 2026 (1 item)
  - Bot 3 - Return - 5× bottle - Approved
```

## Workflow

### Shortage Report Workflow
1. Branch receives delivery with missing items
2. Branch manager clicks "Accept Delivery" (adds received qty to inventory)
3. Branch manager clicks "Report Shortage" on the delivery
4. Fills out shortage form with actual received quantity
5. Admin reviews in Deliveries page
6. Admin approves → missing qty added back to warehouse
7. Both parties can view in Discrepancy page

### Return Request Workflow
1. Branch discovers broken/wrong items
2. Branch manager clicks "Request Return to Warehouse"
3. Fills out return form with item details
4. Admin reviews in Deliveries page
5. Admin approves → qty removed from branch, added to warehouse
6. Both parties can view in Discrepancy page

## Database
- Table: `delivery_discrepancies`
- Types: 'shortage' | 'return'
- Status: 'pending' | 'approved' | 'rejected'
- Tracks: item, quantities, notes, timestamps, who reported/resolved

## API Endpoints
- `GET /delivery-discrepancies` - List all (role-filtered)
- `POST /delivery-discrepancies` - Create new report/request
- `PUT /delivery-discrepancies/:id/approve` - Approve (admin only)
- `PUT /delivery-discrepancies/:id/reject` - Reject with note (admin only)

## Permissions
- **Branch Manager:** Can report shortages and request returns for their branch
- **Branch Staff:** Can view discrepancy history
- **Admin:** Can approve/reject all requests, view all branches
- **Warehouse:** Can view deliveries but not manage discrepancies

## Notes
- All discrepancy actions require a note/reason
- Admins can add notes when rejecting
- Inventory adjustments are automatic upon approval
- Audit log tracks all discrepancy actions
- Notifications sent to admins when new requests are filed
- Notifications sent to branches when requests are approved/rejected
