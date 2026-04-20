# Expiry Date Tracking & Cost Points System

## Overview
This update improves inventory management by:
1. **Tracking by Expiry Date** instead of cost batches (FIFO based on expiry)
2. **Showing expiry dates when recording sales** so staff knows which batch they're selling
3. **Creating a Cost Points page** to track different purchase costs for the same item

## Key Changes

### 1. Expiry Date as Primary Tracking
- **Removed**: Cost batch dependency for inventory tracking
- **Added**: Expiry date as the primary identifier for FIFO (First In, First Out)
- **Sales**: Now records which expiry date batch was sold
- **Inventory**: Items with earliest expiry date are sold first automatically

### 2. Cost Points System (Replaces "Cost Branches")
Instead of "branches" (which conflicts with store branches), we now use **"Cost Points"** to track different purchase costs:

**Examples of Cost Points:**
- "Supplier A" - Regular supplier cost
- "Supplier B" - Alternative supplier cost
- "Bulk Purchase" - Discounted bulk order cost
- "Promo Price" - Promotional purchase cost
- "Regular Price" - Standard purchase cost

**What it tracks:**
- Item description & unit
- Cost point name (e.g., "Supplier A")
- Unit cost
- Suggested selling price
- Active/Inactive status
- Which locations are using this cost

### 3. New Cost Points Page (Admin Only)
**Two Views:**

**Summary View:**
- Shows all items with their cost variations
- Displays cost range (min → max)
- Shows average cost
- Lists all cost points for each item

**Detailed View:**
- All cost points with full details
- Unit cost and selling price
- Profit margin calculation
- Active/inactive status
- Usage tracking (which locations use this cost)

## Database Changes

### New Table: `cost_variations`
```sql
- id
- description (item name)
- unit
- cost_point_name (e.g., "Supplier A", "Bulk Purchase")
- unit_cost
- suggested_selling_price
- is_active
- created_by
- created_at, updated_at
```

### Updated Tables:

**inventory:**
- Enhanced `expiry_date` column with index
- New unique constraint using expiry_date instead of cost_batch_id
- FIFO tracking based on expiry date

**sales:**
- Added `expiry_date` column to track which batch was sold

### New View: `inventory_expiry_status`
Automatically categorizes inventory by expiry status:
- `EXPIRED` - Past expiry date
- `EXPIRING_SOON` - Within 30 days
- `EXPIRING_3_MONTHS` - Within 90 days
- `GOOD` - More than 90 days
- `NO_EXPIRY` - No expiry date set

## API Endpoints

### Cost Variations (Admin Only)
- `GET /api/cost-variations` - Get all cost points
- `GET /api/cost-variations/summary` - Get summary with cost ranges
- `GET /api/cost-variations/item/:description/:unit` - Get cost points for specific item
- `POST /api/cost-variations` - Create new cost point
- `PUT /api/cost-variations/:id` - Update cost point
- `DELETE /api/cost-variations/:id` - Delete cost point (if not in use)

## Frontend Changes

### New Page: Cost Points (`/cost-points`)
- Admin-only access
- Summary and detailed views
- Add/edit/delete cost points
- Toggle active/inactive status
- Search functionality
- Profit margin calculations

### Navigation
- Added "Cost Points" menu item for admin users
- Removed "Sales" from warehouse role

## Migration Steps

### 1. Run Database Migration
```bash
psql -U your_username -d your_database -f server/database/improve_expiry_tracking.sql
```

This migration will:
- Add/enhance expiry_date columns
- Create cost_variations table
- Add expiry_date to sales table
- Create inventory_expiry_status view
- Update indexes and constraints

### 2. Restart Server
```bash
npm run dev
# or
node server/index.js
```

### 3. Set Up Cost Points
1. Log in as admin
2. Go to "Cost Points" page
3. Add cost points for your items:
   - Example: "IMPEUOUS 10S" with cost points:
     - "Supplier A" - Cost: 11, Selling: 22
     - "Supplier B" - Cost: 12, Selling: 22
     - "Bulk Order" - Cost: 10, Selling: 22

## Usage Examples

### For Admin - Managing Cost Points

**Adding a Cost Point:**
1. Go to Cost Points page
2. Click "Add Cost Point"
3. Fill in:
   - Item: "IMPEUOUS 10S"
   - Unit: "BOX"
   - Cost Point Name: "Supplier A"
   - Unit Cost: 11.00
   - Selling Price: 22.00
4. Save

**Viewing Cost Variations:**
- Summary View shows: "IMPEUOUS 10S has 3 cost points, ranging from ₱10-₱12"
- Detailed View shows each cost point with margins

### For Staff - Recording Sales

When recording a sale, staff will now see:
- Item name
- **Expiry date of the batch being sold**
- Quantity available in that batch
- Unit cost and selling price

The system automatically selects the batch with the earliest expiry date (FIFO).

### For Inventory Management

**Expiry Tracking:**
- Items are automatically sorted by expiry date
- Oldest items are sold first (FIFO)
- Expiry warnings show:
  - Red: Expired
  - Orange: Expiring within 30 days
  - Yellow: Expiring within 90 days
  - Green: Good condition

## Benefits

### 1. Better Expiry Management
- Automatic FIFO based on expiry dates
- No more manual tracking of which batch to sell first
- Reduces waste from expired items
- Clear visibility of expiring items

### 2. Cost Transparency
- Track different purchase costs from various suppliers
- Compare costs across suppliers
- Calculate profit margins accurately
- Make informed purchasing decisions

### 3. Improved Sales Recording
- Staff knows exactly which batch they're selling
- Expiry date is recorded with each sale
- Better traceability for recalls or quality issues
- Accurate inventory depletion

### 4. Better Reporting
- Cost analysis by supplier/purchase type
- Profit margin analysis
- Expiry waste tracking
- Purchase optimization insights

## Example Scenario

**Item: IMPEUOUS 10S**

**Cost Points Setup:**
```
Cost Point Name    | Unit Cost | Selling Price | Margin
-------------------|-----------|---------------|--------
Supplier A         | ₱11.00    | ₱22.00       | 100%
Supplier B         | ₱12.00    | ₱22.00       | 83%
Bulk Purchase      | ₱10.00    | ₱22.00       | 120%
```

**Inventory at Branch 1:**
```
Batch | Expiry Date | Cost Point    | Qty | Unit Cost
------|-------------|---------------|-----|----------
1     | 2024-12-15  | Supplier A    | 50  | ₱11.00
2     | 2025-01-20  | Bulk Purchase | 100 | ₱10.00
3     | 2025-02-10  | Supplier B    | 75  | ₱12.00
```

**When Staff Records Sale:**
- System shows: "Selling from Batch 1 (Expires: 2024-12-15)"
- Staff sells 10 units
- Sale records: expiry_date = 2024-12-15, unit_cost = ₱11.00
- Batch 1 quantity reduced to 40

**Admin Views Cost Points:**
- Sees all 3 cost points for IMPEUOUS 10S
- Compares margins: Bulk Purchase gives best margin (120%)
- Decides to order more from bulk supplier

## Rollback Plan

If you need to revert these changes:

```sql
-- Remove new columns
ALTER TABLE sales DROP COLUMN IF EXISTS expiry_date;

-- Drop new table
DROP TABLE IF EXISTS cost_variations;

-- Drop new view
DROP VIEW IF EXISTS inventory_expiry_status;

-- Restore old constraint (if needed)
-- This depends on your previous schema
```

Then restore previous code from git.

## Notes

- All existing inventory continues to work
- Items without expiry dates are treated as "far future" (5 years)
- Cost points are optional - you can add them gradually
- Inactive cost points are hidden but not deleted
- Cannot delete cost points that are in use in inventory
- All changes are logged in audit trail

## Support

If you encounter issues:
1. Check server logs for detailed error messages
2. Verify migration ran successfully
3. Ensure PostgreSQL version is 9.5+
4. Check that all previous migrations completed
