-- Add Branch-to-Branch Transfer Admin Approval Feature
-- Run this in your Neon database console

-- 1. Add requires_admin_approval column to transfers table
ALTER TABLE transfers 
ADD COLUMN IF NOT EXISTS requires_admin_approval BOOLEAN DEFAULT FALSE;

-- 2. Update existing branch-to-branch transfers to require admin approval
UPDATE transfers t
SET requires_admin_approval = TRUE
FROM locations fl, locations tl
WHERE t.from_location_id = fl.id 
  AND t.to_location_id = tl.id
  AND fl.type = 'branch' 
  AND tl.type = 'branch'
  AND t.status = 'pending';

-- 3. Verify the changes
SELECT 
  t.id,
  fl.name as from_location,
  fl.type as from_type,
  tl.name as to_location,
  tl.type as to_type,
  t.status,
  t.requires_admin_approval
FROM transfers t
JOIN locations fl ON t.from_location_id = fl.id
JOIN locations tl ON t.to_location_id = tl.id
ORDER BY t.created_at DESC
LIMIT 10;
