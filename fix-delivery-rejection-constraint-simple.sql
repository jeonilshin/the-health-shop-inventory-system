-- Simple fix for deliveries status check constraint
-- This adds 'rejected' status to the allowed values

-- Drop the existing constraint
ALTER TABLE thehealthshop.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;

-- Add the updated constraint with 'rejected' status included
ALTER TABLE thehealthshop.deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending', 'awaiting_admin', 'admin_confirmed', 'in_transit', 'pending_manager_confirmation', 'delivered', 'cancelled', 'rejected'));
