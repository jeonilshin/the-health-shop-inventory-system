# Database Migration Instructions

## Issue
The import functionality is failing with "duplicate key value violates unique constraint" errors because the database has the wrong unique constraint that prevents multiple cost batches for the same item.

## Solution
Run the migration file to fix the constraint.

## Steps to Apply Migration

### Option 1: Using psql command line
```bash
# Connect to your database and run the migration
psql -U your_username -d your_database_name -f server/database/fix_batch_constraint.sql
```

### Option 2: Using a database GUI tool (pgAdmin, DBeaver, etc.)
1. Open your database connection
2. Open the file `server/database/fix_batch_constraint.sql`
3. Execute the SQL statements

### Option 3: Using Node.js script
Create a file `run-migration.js` in your project root:

```javascript
const pool = require('./server/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'server/database/fix_batch_constraint.sql'),
      'utf8'
    );
    
    console.log('Running migration...');
    await client.query(sql);
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    client.release();
    process.exit();
  }
}

runMigration();
```

Then run:
```bash
node run-migration.js
```

## What This Migration Does

1. **Removes old constraint**: Drops `inventory_location_id_description_unit_key` which only allowed one row per (location, description, unit)

2. **Adds new constraint**: Creates `inventory_location_description_unit_batch_key` which allows multiple rows per (location, description, unit) as long as they have different `cost_batch_id`

3. **Ensures data integrity**: Updates any rows missing `cost_batch_id` and makes the column NOT NULL

4. **Adds performance index**: Creates an index on the new constraint columns

## After Migration

Once the migration is complete:
- Import will work correctly with items that have different costs
- Multiple cost batches can exist for the same item
- Empty selling prices will auto-fill from existing items
- Each item processes in its own transaction to prevent rollback cascade

## Verification

After running the migration, verify it worked:

```sql
-- Check the constraint exists
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'inventory'::regclass 
AND conname LIKE '%batch%';

-- Should show: inventory_location_description_unit_batch_key
```

## Rollback (if needed)

If you need to rollback to the old constraint:

```sql
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_location_description_unit_batch_key;
ALTER TABLE inventory ADD CONSTRAINT inventory_location_id_description_unit_key 
UNIQUE (location_id, description, unit);
```

**Note**: Rolling back will prevent multiple cost batches from working.
