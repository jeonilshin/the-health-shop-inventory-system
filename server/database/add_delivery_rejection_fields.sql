-- Add rejection fields to deliveries table
-- Run this migration to add rejection tracking to deliveries

-- Add rejection_reason column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE thehealthshop.deliveries 
    ADD COLUMN rejection_reason TEXT;
    
    RAISE NOTICE 'Added rejection_reason column to deliveries table';
  ELSE
    RAISE NOTICE 'rejection_reason column already exists in deliveries table';
  END IF;
END $$;

-- Add rejected_by column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE thehealthshop.deliveries 
    ADD COLUMN rejected_by INTEGER REFERENCES thehealthshop.users(id);
    
    RAISE NOTICE 'Added rejected_by column to deliveries table';
  ELSE
    RAISE NOTICE 'rejected_by column already exists in deliveries table';
  END IF;
END $$;

-- Add rejected_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'rejected_at'
  ) THEN
    ALTER TABLE thehealthshop.deliveries 
    ADD COLUMN rejected_at TIMESTAMP;
    
    RAISE NOTICE 'Added rejected_at column to deliveries table';
  ELSE
    RAISE NOTICE 'rejected_at column already exists in deliveries table';
  END IF;
END $$;

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'thehealthshop' 
  AND table_name = 'deliveries'
  AND column_name IN ('rejection_reason', 'rejected_by', 'rejected_at')
ORDER BY column_name;
