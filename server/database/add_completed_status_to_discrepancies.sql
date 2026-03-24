-- Add 'completed' status to delivery_discrepancies table

-- Drop the old constraint
ALTER TABLE delivery_discrepancies 
DROP CONSTRAINT IF EXISTS chk_discrepancy_status;

-- Add the new constraint with 'completed' status
ALTER TABLE delivery_discrepancies 
ADD CONSTRAINT chk_discrepancy_status 
CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

-- Update any existing 'approved' records to 'completed' if needed
-- (Optional - only if you want to migrate old data)
-- UPDATE delivery_discrepancies SET status = 'completed' WHERE status = 'approved';
