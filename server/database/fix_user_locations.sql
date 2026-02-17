-- Fix User Locations
-- Run this to check and fix users without location assignments

-- 1. Check which users don't have locations assigned
SELECT id, username, full_name, role, location_id 
FROM users 
WHERE role IN ('warehouse', 'branch_manager', 'branch_staff') 
  AND location_id IS NULL;

-- 2. View all locations to see available IDs
SELECT id, name, type FROM locations ORDER BY type, name;

-- 3. Example: Assign users to locations (UPDATE THESE WITH YOUR ACTUAL IDs)
-- Replace the location_id and user id values with your actual values

-- Example: Assign warehouse user to warehouse location
-- UPDATE users SET location_id = 1 WHERE id = 2 AND role = 'warehouse';

-- Example: Assign branch manager to a branch
-- UPDATE users SET location_id = 3 WHERE id = 3 AND role = 'branch_manager';

-- Example: Assign branch staff to a branch
-- UPDATE users SET location_id = 3 WHERE id = 4 AND role = 'branch_staff';

-- 4. Verify the changes
SELECT u.id, u.username, u.full_name, u.role, u.location_id, l.name as location_name, l.type
FROM users u
LEFT JOIN locations l ON u.location_id = l.id
WHERE u.role IN ('warehouse', 'branch_manager', 'branch_staff')
ORDER BY u.role, u.username;
