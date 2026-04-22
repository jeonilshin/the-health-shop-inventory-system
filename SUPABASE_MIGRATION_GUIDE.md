# Supabase Migration Guide - Using Custom Schema

## Overview
This guide documents the changes made to migrate from Neon to Supabase with a custom schema named `thehealthshop`.

## Changes Made

### 1. Database Configuration (`server/config/database.js`)
Added schema configuration to the PostgreSQL connection pool:
```javascript
options: '-c search_path=thehealthshop,public'
```

This ensures all queries default to the `thehealthshop` schema first, then fall back to `public` schema if needed.

### 2. Environment Variables

#### `.env.local` (Your Active Configuration)
```env
PORT=5000
DATABASE_URL=postgresql://postgres.fmfoasrdsgotytodyzwk:Happyilshin6203*@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

#### `.env.example` (Template for Others)
Updated to reflect Supabase connection format and added `DATABASE_SSL=true`.

### 3. System Check Route (`server/routes/system-check.js`)
Updated all `information_schema` queries to explicitly check the `thehealthshop` schema:
- Added `table_schema = 'thehealthshop'` condition to all queries
- This ensures the system check validates tables in the correct schema

## How It Works

### Search Path Priority
The `search_path=thehealthshop,public` setting means:
1. PostgreSQL first looks for tables in the `thehealthshop` schema
2. If not found, it falls back to the `public` schema
3. All your application queries will automatically use `thehealthshop` schema

### Why This Approach?
- **No Code Changes Required**: Your existing queries like `SELECT * FROM inventory` automatically use the `thehealthshop` schema
- **Clean Separation**: Your data is isolated in a custom schema
- **Supabase Compatible**: Works with Supabase's multi-schema support
- **Fallback Support**: Can still access `public` schema if needed (for extensions, etc.)

## Testing Your Setup

1. **Start your server**:
   ```bash
   npm start
   ```

2. **Test database connection**:
   - Login to your application
   - Navigate to the Admin panel
   - Check the system status endpoint

3. **Verify schema usage**:
   ```sql
   -- Run this in Supabase SQL Editor to confirm your tables are in the right schema
   SELECT table_schema, table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'thehealthshop';
   ```

## Important Notes

### SSL Connection
- Supabase requires SSL connections
- `DATABASE_SSL=true` is set in your environment variables
- The configuration uses `rejectUnauthorized: false` for compatibility

### Connection Pooling
- Supabase Pooler is being used (port 5432)
- Connection pool is configured with:
  - Max 20 connections
  - Min 2 connections
  - 30s idle timeout

### Security Reminder
- Your database password is visible in `.env.local`
- **Never commit `.env.local` to version control**
- Consider rotating your Supabase password if it's been exposed
- Use environment variables in production deployments

## Troubleshooting

### If tables are not found:
1. Verify your backup was restored to the `thehealthshop` schema in Supabase
2. Check schema exists:
   ```sql
   SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'thehealthshop';
   ```

### If connection fails:
1. Verify the connection string is correct
2. Check Supabase project is active
3. Ensure your IP is allowed (Supabase has connection pooler that should work from anywhere)
4. Test connection with:
   ```bash
   psql "postgresql://postgres.fmfoasrdsgotytodyzwk:Happyilshin6203*@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
   ```

### If queries fail with "relation does not exist":
1. The table might not be in the `thehealthshop` schema
2. Check which schema contains your tables:
   ```sql
   SELECT table_schema, table_name 
   FROM information_schema.tables 
   WHERE table_name = 'your_table_name';
   ```

## Next Steps

1. Test all major features of your application
2. Verify data integrity after migration
3. Update any deployment configurations (Railway, Vercel, etc.) with new environment variables
4. Consider setting up Supabase backups
5. Review Supabase Row Level Security (RLS) policies if needed

## Additional Resources

- [Supabase Database Documentation](https://supabase.com/docs/guides/database)
- [PostgreSQL Schema Documentation](https://www.postgresql.org/docs/current/ddl-schemas.html)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
