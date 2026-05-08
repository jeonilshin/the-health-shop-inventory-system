# Consolidate Duplicate Inventory Batches

## Problem
You have multiple batches of the same product with identical properties (same cost, same price, same expiry date or all no expiry). These should be consolidated into a single batch.

For example:
- Product A - Batch 1: 4 units, no expiry, cost ₱100
- Product A - Batch 2: 3 units, no expiry, cost ₱100
- Product A - Batch 3: 2 units, no expiry, cost ₱100

These should be merged into:
- Product A: 9 units, no expiry, cost ₱100

## Root Cause
The duplicate batches were created because the system wasn't properly checking for existing matching batches before creating new ones, especially during transfers.

## Solution

### Step 1: Preview Duplicates
First, run the preview query to see what will be consolidated:

```bash
psql -U your_username -d your_database -f server/database/consolidate_duplicate_batches.sql
```

This will show you a report of all duplicate batches that will be merged, including:
- Location name
- Product description and unit
- Cost and selling price
- Expiry date (or "No Expiry")
- Number of duplicate batches
- Individual batch IDs and quantities
- Total quantity after consolidation

### Step 2: Execute Consolidation
Once you've reviewed the preview and are ready to consolidate:

1. Open the file `server/database/consolidate_duplicate_batches.sql`
2. Uncomment the consolidation section (remove the `/*` at line 35 and `*/` at the end)
3. Run the script again:

```bash
psql -U your_username -d your_database -f server/database/consolidate_duplicate_batches.sql
```

This will:
- Keep the oldest batch for each group of duplicates
- Update its quantity to the sum of all duplicate batches
- Delete the other duplicate batches
- Show a summary of the consolidated inventory

## What Gets Consolidated

Batches are considered duplicates if they have ALL of the following matching:
- Same location
- Same description (product name)
- Same unit
- Same unit cost
- Same suggested selling price
- Same expiry date (including both being NULL/no expiry)

## Prevention (Already Fixed)

The following improvements have been made to prevent future duplicate batches:

### 1. Inventory Add (inventory.js)
- Already checks for exact matches before creating new batches
- Adds to existing batch if cost, price, and expiry match

### 2. Transfer Receive (transfers.js) - FIXED
- Now checks for existing matching batches at destination
- Only creates new batch if no exact match exists
- Properly handles NULL expiry dates

### 3. Batch Transfer (transfers.js) - FIXED
- Improved to check cost, price, AND expiry date
- Consolidates into existing batches when properties match

### 4. Transfer Unreceive (transfers.js) - FIXED
- Now properly checks for matching batches when returning items
- Preserves batch properties (expiry, batch number)

## After Running the Consolidation

1. **Refresh your inventory page** - You should now see single batches instead of multiple identical ones
2. **Verify quantities** - The total quantity should match the sum of all previous batches
3. **Future additions** - New inventory with matching properties will automatically add to existing batches

## Notes

- The consolidation keeps the oldest batch (lowest ID) and deletes the newer ones
- All quantities are summed correctly
- The max_quantity is preserved as the highest value
- This is a one-time cleanup - future additions will automatically consolidate
- The fix prevents this issue from happening again in transfers and inventory additions
