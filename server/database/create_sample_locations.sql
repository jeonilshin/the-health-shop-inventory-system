-- Create Sample Locations for The Health Shop
-- Run this in your Neon database console

-- First, check if you have any locations
SELECT * FROM locations;

-- If empty or missing branches, create them:

-- Create Warehouses (2 warehouses as mentioned)
INSERT INTO locations (name, type, address, contact_number) VALUES
('Main Warehouse', 'warehouse', '123 Warehouse St, Manila', '02-1234-5678'),
('Secondary Warehouse', 'warehouse', '456 Storage Ave, Quezon City', '02-8765-4321')
ON CONFLICT DO NOTHING;

-- Create Sample Branches (you mentioned 28 branches - here are examples)
-- Update these with your actual branch names and addresses

INSERT INTO locations (name, type, address, contact_number) VALUES
('Branch 1 - Manila', 'branch', 'Unit 1, Manila Shopping Center', '02-1111-1111'),
('Branch 2 - Quezon City', 'branch', 'Unit 2, QC Mall', '02-2222-2222'),
('Branch 3 - Makati', 'branch', 'Unit 3, Makati Square', '02-3333-3333'),
('Branch 4 - Pasig', 'branch', 'Unit 4, Pasig Plaza', '02-4444-4444'),
('Branch 5 - Taguig', 'branch', 'Unit 5, BGC Center', '02-5555-5555'),
('Branch 6 - Mandaluyong', 'branch', 'Unit 6, Mandaluyong Mall', '02-6666-6666'),
('Branch 7 - Caloocan', 'branch', 'Unit 7, Caloocan Market', '02-7777-7777'),
('Branch 8 - Las Piñas', 'branch', 'Unit 8, Las Piñas Center', '02-8888-8888'),
('Branch 9 - Parañaque', 'branch', 'Unit 9, Parañaque Plaza', '02-9999-9999'),
('Branch 10 - Muntinlupa', 'branch', 'Unit 10, Alabang Town', '02-1010-1010')
-- Add more branches as needed up to 28
ON CONFLICT DO NOTHING;

-- Verify locations were created
SELECT id, name, type FROM locations ORDER BY type, name;

-- Now check which location IDs your users are assigned to
SELECT u.id, u.username, u.role, u.location_id, l.name as location_name, l.type
FROM users u
LEFT JOIN locations l ON u.location_id = l.id
WHERE u.role IN ('warehouse', 'branch_manager', 'branch_staff');

-- If user location_ids don't match, update them:
-- Example: If your branch manager (id=5) should be at Branch 1 (which might be id=3 after insert)
-- UPDATE users SET location_id = 3 WHERE id = 5;

-- Example: If your warehouse user (id=7) should be at Main Warehouse (which might be id=1 after insert)
-- UPDATE users SET location_id = 1 WHERE id = 7;
