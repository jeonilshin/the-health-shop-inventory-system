-- Set the search path to use thehealthshop schema
SET search_path TO thehealthshop, public;

-- Add manager approval columns to deliveries table if they don't exist
DO $$
BEGIN
  -- Add requires_manager_approval column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'requires_manager_approval'
  ) THEN
    ALTER TABLE deliveries ADD COLUMN requires_manager_approval BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added requires_manager_approval column to deliveries';
  ELSE
    RAISE NOTICE 'requires_manager_approval column already exists in deliveries';
  END IF;

  -- Add manager_confirmed_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'manager_confirmed_by'
  ) THEN
    ALTER TABLE deliveries ADD COLUMN manager_confirmed_by INTEGER REFERENCES users(id);
    RAISE NOTICE 'Added manager_confirmed_by column to deliveries';
  ELSE
    RAISE NOTICE 'manager_confirmed_by column already exists in deliveries';
  END IF;

  -- Add manager_confirmed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'manager_confirmed_at'
  ) THEN
    ALTER TABLE deliveries ADD COLUMN manager_confirmed_at TIMESTAMP;
    RAISE NOTICE 'Added manager_confirmed_at column to deliveries';
  ELSE
    RAISE NOTICE 'manager_confirmed_at column already exists in deliveries';
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_deliveries_manager_approval ON deliveries(requires_manager_approval) WHERE requires_manager_approval = TRUE;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'thehealthshop' 
AND table_name = 'deliveries' 
AND column_name IN ('requires_manager_approval', 'manager_confirmed_by', 'manager_confirmed_at')
ORDER BY column_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Deliveries table manager columns added successfully!';
  RAISE NOTICE 'You can now accept deliveries as staff without errors.';
END $$;