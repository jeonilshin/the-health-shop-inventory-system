# Neon Database Setup Guide

## Step 1: Create Neon Account & Database

1. Go to https://console.neon.tech
2. Sign up or log in
3. Click "Create Project"
4. Name your project: "The Health Shop Inventory"
5. Select a region closest to you
6. Click "Create Project"

## Step 2: Get Connection String

1. After project creation, you'll see your connection string
2. It looks like: `postgresql://username:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require`
3. Copy this connection string

## Step 3: Update .env File

1. Open the `.env` file in your project root
2. Replace the `DATABASE_URL` value with your Neon connection string
3. Change the database name from `neondb` to `the_health_shop_inventory` in the connection string
   
   Example:
   ```
   DATABASE_URL=postgresql://username:password@ep-xxx-xxx.region.aws.neon.tech/the_health_shop_inventory?sslmode=require
   ```

## Step 4: Create Database Tables

You have two options:

### Option A: Using Neon SQL Editor (Recommended)

1. In Neon console, click "SQL Editor" in the left sidebar
2. Open the file `server/database/schema.sql` from your project
3. Copy all the SQL content
4. Paste it into the Neon SQL Editor
5. Click "Run" to execute

### Option B: Using Command Line

1. Install PostgreSQL client tools if not installed
2. Run this command (replace with your connection string):
   ```bash
   psql "postgresql://username:password@ep-xxx-xxx.region.aws.neon.tech/the_health_shop_inventory?sslmode=require" -f server/database/schema.sql
   ```

## Step 5: Verify Setup

Your database should now have these tables:
- users
- locations
- inventory
- transfers
- sales

## Step 6: Create Initial Data

After running the schema, you'll have a default admin user:
- Username: `admin`
- Password: `admin123`

**IMPORTANT: Change this password immediately after first login!**

## Step 7: Add Your Locations

You need to add your 28 branches and 2 warehouses. You can do this via:

1. **SQL Editor in Neon** (Quick way):
   ```sql
   -- Add warehouses
   INSERT INTO locations (name, type, address, contact_number) VALUES
   ('Main Warehouse', 'warehouse', 'Address here', '123-456-7890'),
   ('Secondary Warehouse', 'warehouse', 'Address here', '123-456-7891');

   -- Add branches (repeat for all 28)
   INSERT INTO locations (name, type, address, contact_number) VALUES
   ('Branch 1', 'branch', 'Address here', '123-456-7892'),
   ('Branch 2', 'branch', 'Address here', '123-456-7893');
   -- ... add remaining branches
   ```

2. **After starting the app** - Admin can add locations through the API

## Troubleshooting

- **Connection refused**: Check if your IP is allowed in Neon (Neon allows all IPs by default)
- **SSL error**: Make sure `?sslmode=require` is at the end of your connection string
- **Database not found**: Make sure you changed `neondb` to `the_health_shop_inventory` in the connection string

## Notes

- Neon has a free tier with 0.5GB storage (plenty for this system)
- Your database will auto-suspend after inactivity (free tier) and wake up on first query
- Connection pooling is handled automatically by Neon
- Backups are automatic on paid plans
