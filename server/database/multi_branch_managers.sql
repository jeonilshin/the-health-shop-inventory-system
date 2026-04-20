-- Enable managers to manage multiple branches
-- Create a junction table for manager-branch assignments

CREATE TABLE IF NOT EXISTS manager_branches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, location_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_manager_branches_user ON manager_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_manager_branches_location ON manager_branches(location_id);

-- Migrate existing branch_manager assignments to the new table
INSERT INTO manager_branches (user_id, location_id)
SELECT id, location_id 
FROM users 
WHERE role = 'branch_manager' AND location_id IS NOT NULL
ON CONFLICT (user_id, location_id) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE manager_branches IS 'Junction table allowing managers to be assigned to multiple branches';
