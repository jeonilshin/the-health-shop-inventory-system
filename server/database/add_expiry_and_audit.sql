-- Migration: Add Expiry Date Tracking and Audit Log System
-- Run this in your Neon database console

-- 1. Add expiry_date and batch_number to inventory table
ALTER TABLE inventory 
ADD COLUMN expiry_date DATE,
ADD COLUMN batch_number VARCHAR(100);

-- 2. Create audit_log table for tracking all system activities
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id INTEGER,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create indexes for audit_log for better query performance
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_record ON audit_log(table_name, record_id);

-- 4. Add index for expiry_date searches
CREATE INDEX idx_inventory_expiry ON inventory(expiry_date) WHERE expiry_date IS NOT NULL;

-- 5. Add index for inventory description search (for autocomplete)
CREATE INDEX idx_inventory_description ON inventory(description);

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory' 
  AND column_name IN ('expiry_date', 'batch_number');

SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'audit_log';
