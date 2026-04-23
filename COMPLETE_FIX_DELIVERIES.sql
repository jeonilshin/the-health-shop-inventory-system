-- ============================================================================
-- COMPLETE FIX FOR DELIVERIES - Run this in Supabase SQL Editor
-- ============================================================================

-- Set the search path to use thehealthshop schema
SET search_path TO thehealthshop, public;

-- ============================================================================
-- STEP 1: Add missing columns to deliveries table
-- ============================================================================

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
    RAISE NOTICE '✓ Added requires_manager_approval column to deliveries';
  ELSE
    RAISE NOTICE '✓ requires_manager_approval column already exists';
  END IF;

  -- Add manager_confirmed_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'manager_confirmed_by'
  ) THEN
    ALTER TABLE deliveries ADD COLUMN manager_confirmed_by INTEGER REFERENCES users(id);
    RAISE NOTICE '✓ Added manager_confirmed_by column to deliveries';
  ELSE
    RAISE NOTICE '✓ manager_confirmed_by column already exists';
  END IF;

  -- Add manager_confirmed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'thehealthshop' 
    AND table_name = 'deliveries' 
    AND column_name = 'manager_confirmed_at'
  ) THEN
    ALTER TABLE deliveries ADD COLUMN manager_confirmed_at TIMESTAMP;
    RAISE NOTICE '✓ Added manager_confirmed_at column to deliveries';
  ELSE
    RAISE NOTICE '✓ manager_confirmed_at column already exists';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Create index for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_deliveries_manager_approval 
ON deliveries(requires_manager_approval) 
WHERE requires_manager_approval = TRUE;

DO $$
BEGIN
  RAISE NOTICE '✓ Created index for manager approvals';
END $$;

-- ============================================================================
-- STEP 3: Fix the trigger function (remove old triggers first)
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_log_delivery_manager_actions ON deliveries;
DROP TRIGGER IF EXISTS trigger_log_transfer_manager_actions ON transfers;
DROP FUNCTION IF EXISTS log_manager_action();

DO $$
BEGIN
  RAISE NOTICE '✓ Dropped old triggers and function';
END $$;

-- ============================================================================
-- STEP 4: Create the corrected trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION log_manager_action()
RETURNS TRIGGER AS $$
BEGIN
  -- Log transfer approvals
  IF TG_TABLE_NAME = 'transfers' AND OLD.manager_approved_by IS NULL AND NEW.manager_approved_by IS NOT NULL THEN
    -- Only insert if manager_actions table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'manager_actions') THEN
      INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
      VALUES (NEW.manager_approved_by, 'approve_transfer', 'transfer', NEW.id, NEW.to_location_id, 'Transfer approved by manager');
    END IF;
  END IF;
  
  -- Log delivery confirmations (use manager_confirmed_by, NOT manager_approved_by)
  IF TG_TABLE_NAME = 'deliveries' AND OLD.manager_confirmed_by IS NULL AND NEW.manager_confirmed_by IS NOT NULL THEN
    -- Only insert if manager_actions table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'manager_actions') THEN
      INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
      VALUES (NEW.manager_confirmed_by, 'confirm_delivery', 'delivery', NEW.id, NEW.to_location_id, 'Delivery confirmed by manager');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  RAISE NOTICE '✓ Created corrected log_manager_action function';
END $$;

-- ============================================================================
-- STEP 5: Create the triggers
-- ============================================================================

CREATE TRIGGER trigger_log_transfer_manager_actions
  AFTER UPDATE ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION log_manager_action();

CREATE TRIGGER trigger_log_delivery_manager_actions
  AFTER UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION log_manager_action();

DO $$
BEGIN
  RAISE NOTICE '✓ Created triggers for transfers and deliveries';
END $$;

-- ============================================================================
-- STEP 6: Verify the columns were added
-- ============================================================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns 
  WHERE table_schema = 'thehealthshop' 
  AND table_name = 'deliveries' 
  AND column_name IN ('requires_manager_approval', 'manager_confirmed_by', 'manager_confirmed_at');
  
  IF col_count = 3 THEN
    RAISE NOTICE '✅ SUCCESS! All 3 columns verified in deliveries table';
  ELSE
    RAISE NOTICE '⚠ WARNING: Only % of 3 columns found', col_count;
  END IF;
END $$;

-- ============================================================================
-- FINAL MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ MIGRATION COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '1. Added manager approval columns to deliveries table';
  RAISE NOTICE '2. Fixed trigger to use correct column name (manager_confirmed_by)';
  RAISE NOTICE '3. Created performance indexes';
  RAISE NOTICE '';
  RAISE NOTICE 'Staff can now accept deliveries without errors!';
  RAISE NOTICE '';
END $$;
