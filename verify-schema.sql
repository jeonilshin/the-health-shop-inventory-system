-- Run this in Supabase SQL Editor to check where your tables are located

-- 1. Check if thehealthshop schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'thehealthshop';

-- 2. List all tables in thehealthshop schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'thehealthshop' 
ORDER BY table_name;

-- 3. Check if users table exists in any schema
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name = 'users';

-- 4. If tables are in public schema instead, you can move them:
-- ALTER TABLE public.users SET SCHEMA thehealthshop;
-- (Run this for each table if needed)