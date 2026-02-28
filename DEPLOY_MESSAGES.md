# Deploy Messaging System - Quick Guide

## The Problem
You're seeing 404 errors because:
1. The server hasn't restarted to load the new `/api/messages` routes
2. The database tables haven't been created yet

## Solution

### Step 1: Run Database Migration

Connect to your Render PostgreSQL database and run:

```bash
# Option 1: Using Render Shell
# Go to your Render dashboard > Your database > Shell tab
# Then paste the contents of server/database/messages.sql

# Option 2: Using psql locally
psql "your-render-database-url" -f server/database/messages.sql
```

Or manually run these SQL commands in your database:

```sql
-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  subject VARCHAR(255),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read);
```

### Step 2: Restart Your Server

**On Render:**
1. Go to your Render dashboard
2. Find your web service
3. Click "Manual Deploy" > "Deploy latest commit"
   OR
4. Click the three dots menu > "Restart Service"

**Locally (for testing):**
```bash
# Stop the server (Ctrl+C)
# Then restart:
npm start
```

### Step 3: Verify It Works

1. Open your app
2. Go to Messages
3. Click "New"
4. You should now see a list of users with their roles and branches

## What Should Appear

When you click "New", you should see users listed like:

```
👤 John Doe
   ADMIN • Main Warehouse

👤 Jane Smith
   BRANCH MANAGER • Makati Branch

👤 Mike Johnson
   WAREHOUSE • Cebu Warehouse
```

## Troubleshooting

### Still getting 404 errors?
- Check that server/index.js has: `app.use('/api/messages', require('./routes/messages'));`
- Verify the server restarted successfully
- Check Render logs for any startup errors

### "Loading users..." message?
- Database migration hasn't run yet
- Check database connection
- Verify users table has `full_name` column

### No users showing?
- Make sure you have other users in the database
- Non-admin users can only see admins
- Admin users can see everyone

## Current Status

✅ Code pushed to GitHub (commit: d88c69b)
✅ Frontend ready
✅ Backend routes ready
⏳ Waiting for: Database migration + Server restart

---

**Next Steps:**
1. Run the SQL migration on your Render database
2. Restart your Render service
3. Test the messaging feature
