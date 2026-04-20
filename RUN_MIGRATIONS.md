# How to Run the Role Improvement Migrations

## Prerequisites
- PostgreSQL database access
- Database credentials (username, password, database name)
- psql command-line tool installed

## Step-by-Step Instructions

### Option 1: Using psql Command Line

1. **Navigate to your project directory**:
```bash
cd /path/to/your/project
```

2. **Run the first migration** (Multi-branch managers):
```bash
psql -U your_username -d your_database_name -f server/database/multi_branch_managers.sql
```

3. **Run the second migration** (Staff permissions):
```bash
psql -U your_username -d your_database_name -f server/database/staff_transfer_permissions.sql
```

4. **Verify migrations**:
```bash
psql -U your_username -d your_database_name -c "\d manager_branches"
psql -U your_username -d your_database_name -c "\d transfers"
psql -U your_username -d your_database_name -c "\d deliveries"
```

### Option 2: Using Database GUI (pgAdmin, DBeaver, etc.)

1. Open your database GUI tool
2. Connect to your database
3. Open a new SQL query window
4. Copy and paste the contents of `server/database/multi_branch_managers.sql`
5. Execute the query
6. Copy and paste the contents of `server/database/staff_transfer_permissions.sql`
7. Execute the query

### Option 3: Using Node.js Migration Script

If you have the `run-migration.js` script in your project:

```bash
node run-migration.js server/database/multi_branch_managers.sql
node run-migration.js server/database/staff_transfer_permissions.sql
```

## Verification

After running migrations, verify the changes:

```sql
-- Check if manager_branches table exists
SELECT * FROM manager_branches LIMIT 1;

-- Check if new columns exist in transfers table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transfers' 
AND column_name IN ('requires_manager_approval', 'manager_approved_by', 'manager_approved_at');

-- Check if new columns exist in deliveries table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'deliveries' 
AND column_name IN ('requires_manager_approval', 'manager_confirmed_by', 'manager_confirmed_at');
```

## Expected Results

After successful migration, you should see:

1. **manager_branches table** with columns:
   - id (SERIAL PRIMARY KEY)
   - user_id (INTEGER)
   - location_id (INTEGER)
   - created_at (TIMESTAMP)

2. **transfers table** with new columns:
   - requires_manager_approval (BOOLEAN)
   - manager_approved_by (INTEGER)
   - manager_approved_at (TIMESTAMP)

3. **deliveries table** with new columns:
   - requires_manager_approval (BOOLEAN)
   - manager_confirmed_by (INTEGER)
   - manager_confirmed_at (TIMESTAMP)

## Troubleshooting

### Error: "relation already exists"
This means the table or column already exists. You can safely ignore this error or check if the migration was already run.

### Error: "permission denied"
Make sure your database user has CREATE TABLE and ALTER TABLE permissions.

### Error: "database does not exist"
Verify your database name is correct and the database exists.

## Post-Migration Steps

1. **Restart your server**:
```bash
npm run dev
# or
node server/index.js
```

2. **Test the new features**:
   - Log in as admin
   - Go to Admin panel
   - Try assigning a manager to multiple branches
   - Log in as staff
   - Try creating a transfer request
   - Log in as manager
   - Try approving the staff transfer

3. **Check logs** for any errors during startup

## Rollback (if needed)

If you need to undo the migrations:

```sql
-- Remove new columns from transfers
ALTER TABLE transfers DROP COLUMN IF EXISTS requires_manager_approval;
ALTER TABLE transfers DROP COLUMN IF EXISTS manager_approved_by;
ALTER TABLE transfers DROP COLUMN IF EXISTS manager_approved_at;

-- Remove new columns from deliveries
ALTER TABLE deliveries DROP COLUMN IF EXISTS requires_manager_approval;
ALTER TABLE deliveries DROP COLUMN IF EXISTS manager_confirmed_by;
ALTER TABLE deliveries DROP COLUMN IF EXISTS manager_confirmed_at;

-- Drop manager_branches table
DROP TABLE IF EXISTS manager_branches;
```

## Support

If you encounter any issues:
1. Check the server logs for detailed error messages
2. Verify database connection settings in `.env` file
3. Ensure all previous migrations have been run successfully
4. Check PostgreSQL version compatibility (requires PostgreSQL 9.5+)
