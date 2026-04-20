# Multi-Expiry and Costs Page Updates

## Changes Completed

### 1. Inventory Page - MULTI-EXP View
**File**: `client/src/components/Inventory.js`

**Changes**:
- Removed Unit Cost, Suggested Price, and Total Value columns from MULTI-EXP items
- When an item has `hasMultipleExpiry === true`, only these columns are shown:
  - Description
  - Unit
  - Quantity (with batch count)
  - Batch
  - Expiry
  - Actions
- Cost and selling price columns are now hidden for MULTI-EXP items to reduce clutter
- Users can still view individual batch costs by clicking "Edit Batches"

### 2. Costs Page - MULTI-COST View
**Files**: 
- `server/routes/cost-variations.js` (new endpoint)
- `client/src/components/CostVariations.js` (new view)

**New Features**:
- Added new endpoint: `GET /api/cost-variations/multi-cost-items`
  - Returns items that have different costs across different locations
  - Shows cost variations by location (warehouse vs branches)
  
- Updated Costs page with 3 views:
  1. **Multi-Cost Items** (default view)
     - Shows items with different costs across locations
     - Displays location-by-location breakdown with:
       - Location name and type (warehouse/branch)
       - Unit cost at that location
       - Selling price at that location
       - Quantity at that location
     - Helps identify pricing inconsistencies
  
  2. **Cost Points** (formerly "Summary View")
     - Shows all defined cost points
     - Tracks different purchase costs from suppliers
  
  3. **All Points** (formerly "Detailed View")
     - Shows detailed list of all cost points

### 3. Navigation Updates
- Changed button labels from "Summary View" / "Detailed View" to "Cost Points" / "All Points"
- Added "Multi-Cost Items" as the default view
- Updated info text to explain each view's purpose

## What This Solves

### Problem 1: MULTI-EXP items showing too much info
**Before**: MULTI-EXP items showed cost ranges (min to max) which was confusing
**After**: MULTI-EXP items only show quantity, batch, and expiry - cleaner view

### Problem 2: No way to see cost variations across locations
**Before**: Cost page only showed cost points (supplier pricing)
**After**: Cost page now shows which items have different costs at different locations

## Important Notes

### Database Migration Still Required
The inventory batching by expiry date will NOT work correctly until you run this SQL:

```sql
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_cost_batch_id_key;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_id_description_unit_key;
DROP INDEX IF EXISTS idx_inventory_unique_expiry;
CREATE UNIQUE INDEX idx_inventory_unique_expiry ON inventory(location_id, description, unit, unit_cost, COALESCE(expiry_date, '9999-12-31'::date));
DELETE FROM inventory WHERE description = 'TEST';
```

**Why this is needed**: The current database constraint allows items with different expiry dates to merge into one batch. The new constraint prevents this.

### Testing Steps
1. Run the SQL migration above
2. Restart your server
3. Go to /inventory
4. Add TEST item with expiry 06/22/2026, quantity 12
5. Add TEST item with expiry 06/23/2026, quantity 2
6. Add TEST item with expiry 06/24/2026, quantity 2
7. You should see MULTI-EXP badge with 3 separate batches
8. Click "Edit Batches" to see all 3 batches with their expiry dates
9. Notice that cost/selling price columns are hidden for MULTI-EXP items
10. Go to /costs to see the Multi-Cost Items view

## Files Modified
- `client/src/components/Inventory.js` - Hide cost columns for MULTI-EXP
- `client/src/components/CostVariations.js` - Add Multi-Cost Items view
- `server/routes/cost-variations.js` - Add multi-cost-items endpoint
