-- Set the search path to use thehealthshop schema
SET search_path TO thehealthshop, public;

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS trigger_log_delivery_manager_actions ON deliveries;
DROP TRIGGER IF EXISTS trigger_log_transfer_manager_actions ON transfers;
DROP FUNCTION IF EXISTS log_manager_action();

-- Recreate the function with correct column names
CREATE OR REPLACE FUNCTION log_manager_action()
RETURNS TRIGGER AS $$
BEGIN
  -- Log transfer approvals
  IF TG_TABLE_NAME = 'transfers' AND OLD.manager_approved_by IS NULL AND NEW.manager_approved_by IS NOT NULL THEN
    INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
    VALUES (NEW.manager_approved_by, 'approve_transfer', 'transfer', NEW.id, NEW.to_location_id, 'Transfer approved by manager');
  END IF;
  
  -- Log delivery confirmations (use manager_confirmed_by, not manager_approved_by)
  IF TG_TABLE_NAME = 'deliveries' AND OLD.manager_confirmed_by IS NULL AND NEW.manager_confirmed_by IS NOT NULL THEN
    INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
    VALUES (NEW.manager_confirmed_by, 'confirm_delivery', 'delivery', NEW.id, NEW.to_location_id, 'Delivery confirmed by manager');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers
CREATE TRIGGER trigger_log_transfer_manager_actions
  AFTER UPDATE ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION log_manager_action();

CREATE TRIGGER trigger_log_delivery_manager_actions
  AFTER UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION log_manager_action();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Manager action trigger fixed successfully!';
  RAISE NOTICE 'The trigger now uses the correct column name: manager_confirmed_by';
  RAISE NOTICE 'You can now accept deliveries without errors.';
END $$;