-- Fix notification timestamps to use timezone-aware timestamps
-- This ensures timestamps are stored and retrieved consistently

-- Alter the created_at column to use TIMESTAMPTZ
ALTER TABLE notifications 
ALTER COLUMN created_at TYPE TIMESTAMPTZ 
USING created_at AT TIME ZONE 'UTC';

-- Update the default to use timezone-aware timestamp
ALTER TABLE notifications 
ALTER COLUMN created_at SET DEFAULT NOW();

-- Recreate the index
DROP INDEX IF EXISTS idx_notifications_created;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
