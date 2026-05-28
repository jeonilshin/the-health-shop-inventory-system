-- Fix deliveries status check constraint to allow 'rejected' status
-- Run this to fix the "deliveries_status_check" constraint violation error
-- This script targets the 'thehealthshop' schema

-- Drop the existing constraint
ALTER TABLE thehealthshop.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;

-- Add the updated constraint with 'rejected' status included
ALTER TABLE thehealthshop.deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending', 'awaiting_admin', 'admin_confirmed', 'in_transit', 'pending_manager_confirmation', 'delivered', 'cancelled', 'rejected'));

-- Verify the constraint was updated
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE c.conname = 'deliveries_status_check'
  AND n.nspname = 'thehealthshop'
  AND t.relname = 'deliveries';

-- Show current deliveries table columns
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'thehealthshop' 
  AND table_name = 'deliveries'
ORDER BY ordinal_position;
