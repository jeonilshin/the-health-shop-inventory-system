-- Enhance audit log table with description column
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS description TEXT;

-- Add index for better performance on description searches
CREATE INDEX IF NOT EXISTS idx_audit_log_description ON audit_log(description);

-- Add index for action filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Add index for table_name filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);

-- Add index for date range queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
