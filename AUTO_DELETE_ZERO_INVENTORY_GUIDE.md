# Auto-Delete Zero Inventory Batches

## Problem
When inventory batches are sold out or transferred completely, they remain in the database with 0 quantity. This creates clutter and shows empty batches like "Batch 2: 0 units, Expiry: 01/20/2027" which is confusing and unnecessary.

## Solution
The system now automatically deletes inventory records when their quantity reaches 0 or below. This keeps the inventory clean and prevents accumulation of empty batches.

## How It Works

### Automatic Cleanup
When inventory quantity is reduced to 0 through any of these operations, the batch is automatically deleted:

1. **Sales Transactions** - When items are sold
2. **Transfers** - When items are transferred to another location
3. **Stock Withdrawals** - When items are pulled out for employee purchase, principal, or outside party
4. **Batch Transfers** - When multiple items are transferred at once

### Implementation
A utility function `cleanupZeroInventory()` is called after every inventory quantity reduction. It:
- Checks if the quantity is 0 or negative
- Automatically deletes the record if true
- Logs the cleanup action for tracking
- Fails silently to not disrupt the main operation

## Cleanup Existing Zero-Quantity Batches

### Step 1: Preview Zero-Quantity Records
First, see what will be deleted:

```bash
psql -U your_username -d your_database -f server/database/cleanup_zero_inventory.sql
```

This shows:
- All inventory records with quantity <= 0
- Location, description, unit, expiry date, batch number
- Count by location

### Step 2: Execute Cleanup
Once you've reviewed and are ready to clean up:

1. Open `server/database/cleanup_zero_inventory.sql`
2. Uncomment the DELETE section (remove `/*` and `*/`)
3. Run the script again:

```bash
psql -U your_username -d your_database -f server/database/cleanup_zero_inventory.sql
```

This will permanently delete all zero-quantity inventory records.

## Alternative: Database Trigger (Optional)

If you prefer a database-level solution, you can use the trigger approach:

```bash
psql -U your_username -d your_database -f server/database/auto_delete_zero_inventory.sql
```

This creates a PostgreSQL trigger that automatically deletes inventory records when quantity is updated to 0 or below.

**Note:** The application-level cleanup (already implemented) is recommended as it provides better logging and control. The trigger is provided as an alternative if you prefer database-level enforcement.

## Benefits

1. **Cleaner Inventory View** - No more empty batches cluttering the display
2. **Accurate Batch Counts** - Only shows batches with actual inventory
3. **Better Performance** - Fewer records to query and display
4. **Automatic** - No manual cleanup needed
5. **Safe** - Only deletes when quantity is truly 0

## What Happens to History?

- **Audit logs** are preserved - all sales, transfers, and withdrawals are still tracked
- **Sales transactions** still show what was sold
- **Transfer history** still shows what was moved
- Only the empty inventory record is removed

## Examples

### Before
```
Product A
├─ Batch 1: 10 units, No Expiry
├─ Batch 2: 0 units, Expiry: 01/20/2027  ← Empty batch
└─ Batch 3: 5 units, Expiry: 03/15/2027
```

### After
```
Product A
├─ Batch 1: 10 units, No Expiry
└─ Batch 2: 5 units, Expiry: 03/15/2027  ← Clean, no empty batches
```

## Verification

After implementing, you can verify it's working by:

1. Making a sale that completely depletes a batch
2. Refreshing the inventory page
3. The empty batch should no longer appear

You can also check the server logs for cleanup messages:
```
🧹 Cleaned up 1 zero-quantity inventory record(s)
```
