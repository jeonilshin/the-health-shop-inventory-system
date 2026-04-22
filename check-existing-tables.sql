-- Check what tables exist in thehealthshop schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'thehealthshop' 
ORDER BY table_name;

-- Check specifically for sales-related tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'thehealthshop' 
AND table_name LIKE '%sales%'
ORDER BY table_name;