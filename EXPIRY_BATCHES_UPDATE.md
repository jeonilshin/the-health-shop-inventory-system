# Expiry Batches & Cost Points by Location Update

## Summary of Changes

This update refines the inventory and costing system to:
1. **Show batches by expiry date** in the Inventory page (not by cost)
2. **Show cost variations by location** in the Cost Points page (including warehouse)
3. **Separate concerns**: Inventory tracks expiry, Cost Points tracks pricing across locations

## What Changed

### 1. Inventory Page - Batches by Expiry Date

**Before:**
- Batches were shown by cost (cost_batch_id)
- Multiple entries for same item with different costs

**After:**
- Batches are shown by expiry date
- Each batch shows:
  - Expiry date
  - Quantity available
  - Expiry status (Expired, Expiring Soon, Good, etc.)
  - Days until expiry

**New API Endpoint:**
```
GET /api/inventory/expiry-batches/:locationId/:description/:unit
```

Returns batches sorted by expiry date (oldest first - FIFO):
```json
[
  {
    "id": 123,
    "expiry_date": "2024-12-15",
    "quantity": 50,
    "unit_cost": 11.00,
    "suggested_selling_price": 22.00,
    "batch_number": "BATCH001",
    "expiry_status": "EXPIRING_SOON",
    "days_until_expiry": 25
  }
]
```

### 2. Cost Points Page - Inventory by Location

**New Feature:**
- Click "View by Location" on any item in summary view
- Shows how that item's cost varies across all locations (branches + warehouse)
- Displays:
  - Location name and type (warehouse/branch)
  - Unit cost and selling price at that location
  - Total quantity at that location
  - Number of batches
  - Expiry date range
  - Detailed batch breakdown with expiry dates

**New API Endpoint:**
```
GET /api/cost-variations/inventory-by-location/:description/:unit
```

Returns inventory grouped by location and cost:
```json
[
  {
    "location_id": 1,
    "location_name": "Main Warehouse",
    "location_type": "warehouse",
    "unit_cost": 11.00,
    "suggested_selling_price": 22.00,
    "total_quantity": 150,
    "batch_count": 3,
    "earliest_expiry": "2024-12-15",
    "latest_expiry": "2025-02-10",
    "batches": [
      {
        "id": 123,
        "quantity": 50,
        "expiry_date": "2024-12-15",
        "batch_number": "BATCH001"
      }
    ]
  }
]
```

## File Changes

### Backend:
- `server/routes/inventory.js` - Added `expiry-batches` endpoint
- `server/routes/cost-variations.js` - Added `inventory-by-location` endpoint

### Frontend:
- `client/src/components/CostVariations.js` - Added "by-location" view

## How to Use

### For Staff - Viewing Inventory Batches

1. Go to Inventory page
2. Click on an item to view batches
3. See batches sorted by expiry date:
   ```
   Expiry Date    | Quantity | Status
   --------------|----------|------------------
   2024-12-15    | 50       | 🟠 Expiring Soon (25 days)
   2025-01-20    | 100      | 🟢 Good (61 days)
   2025-02-10    | 75       | 🟢 Good (82 days)
   ```

### For Admin - Viewing Cost by Location

1. Go to Cost Points page
2. Find an item (e.g., "IMPEUOUS 10S")
3. Click "View by Location"
4. See cost distribution:
   ```
   Location        | Type      | Cost  | Selling | Qty | Batches
   ----------------|-----------|-------|---------|-----|--------
   Main Warehouse  | warehouse | ₱11   | ₱22     | 150 | 3
   Branch 1        | branch    | ₱11   | ₱22     | 50  | 1
   Branch 2        | branch    | ₱12   | ₱22     | 75  | 2
   ```

## Benefits

### 1. Clear Separation of Concerns
- **Inventory Page**: Focus on expiry dates and stock levels
- **Cost Points Page**: Focus on pricing and cost analysis

### 2. Better Expiry Management
- Staff immediately see which batch expires first
- FIFO is automatic based on expiry date
- Clear visual indicators for expiring items

### 3. Better Cost Analysis
- Admin can see cost variations across all locations
- Compare warehouse vs branch costs
- Identify pricing inconsistencies
- Track which locations have which cost points

### 4. Improved Decision Making
- Know which locations need restocking
- See which batches are expiring where
- Compare costs across suppliers and locations
- Optimize purchasing based on location needs

## Example Scenarios

### Scenario 1: Staff Recording Sale

**Before:**
- Staff sees multiple batches with different costs
- Confused about which batch to sell from

**After:**
- Staff sees batches sorted by expiry date
- System shows: "Selling from batch expiring 2024-12-15 (25 days)"
- Staff knows they're selling the oldest stock first

### Scenario 2: Admin Analyzing Costs

**Before:**
- Hard to see cost variations across locations
- No clear view of inventory distribution

**After:**
- Admin goes to Cost Points → "IMPEUOUS 10S" → "View by Location"
- Sees:
  - Warehouse has 150 units at ₱11
  - Branch 1 has 50 units at ₱11
  - Branch 2 has 75 units at ₱12 (different supplier!)
- Admin investigates why Branch 2 has higher cost
- Decides to transfer from warehouse instead

### Scenario 3: Expiry Management

**Before:**
- Hard to track which batches are expiring
- Manual checking required

**After:**
- Inventory page shows expiry status for each batch
- Orange warning for items expiring within 30 days
- Red alert for expired items
- Staff can prioritize selling expiring stock

## Technical Details

### Expiry Status Categories:
- `EXPIRED` - Past expiry date (red)
- `EXPIRING_SOON` - Within 30 days (orange)
- `EXPIRING_3_MONTHS` - Within 90 days (yellow)
- `GOOD` - More than 90 days (green)
- `NO_EXPIRY` - No expiry date set (gray)

### FIFO Logic:
Items are automatically sorted by expiry date:
1. Items with expiry dates come first
2. Sorted by earliest expiry first
3. Items without expiry dates come last
4. When selling, system picks from earliest expiry batch

### Cost Grouping:
Inventory is grouped by:
1. Location (warehouse/branch)
2. Unit cost (different purchase prices)
3. Selling price

This allows tracking of:
- Same item, different costs at same location
- Same item, same cost at different locations
- Cost variations across the entire system

## Migration

No new migration required! The previous migration (`improve_expiry_tracking.sql`) already set up the necessary database structure.

Just restart your server to use the new endpoints.

## Notes

- Old `cost-batches` endpoint still works for backward compatibility
- New `expiry-batches` endpoint is recommended for all new code
- Cost Points page is admin-only
- Warehouse inventory is included in "by-location" view
- All locations (warehouse + branches) are shown together
