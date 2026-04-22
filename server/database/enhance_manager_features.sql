-- Set the search path to use thehealthshop schema first
SET search_path TO thehealthshop, public;

-- Enhance manager features for multi-branch management
-- This migration adds additional fields and indexes to support the enhanced manager dashboard

-- Add indexes for better performance on manager queries (only if tables exist)
DO $$
BEGIN
  -- Add sales_transactions indexes only if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'sales_transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_sales_transactions_location_date ON sales_transactions(location_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_sales_transactions_date ON sales_transactions(transaction_date);
    RAISE NOTICE 'Added sales_transactions indexes';
  ELSE
    RAISE NOTICE 'sales_transactions table not found, skipping related indexes';
  END IF;

  -- Add inventory indexes (should exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'inventory') THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_location_quantity ON inventory(location_id, quantity);
    RAISE NOTICE 'Added inventory indexes';
  END IF;

  -- Add transfer and delivery indexes (should exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'transfers') THEN
    CREATE INDEX IF NOT EXISTS idx_transfers_location_status ON transfers(from_location_id, to_location_id, status);
    RAISE NOTICE 'Added transfers indexes';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'deliveries') THEN
    CREATE INDEX IF NOT EXISTS idx_deliveries_location_status ON deliveries(from_location_id, to_location_id, status);
    RAISE NOTICE 'Added deliveries indexes';
  END IF;
END $$;

-- Ensure manager_branches table has proper constraints and indexes
-- Add foreign key constraints (only if they don't exist)
DO $$
BEGIN
  -- Add user foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_manager_branches_user' 
    AND table_name = 'manager_branches'
    AND table_schema = 'thehealthshop'
  ) THEN
    ALTER TABLE manager_branches 
    ADD CONSTRAINT fk_manager_branches_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- Add location foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_manager_branches_location' 
    AND table_name = 'manager_branches'
    AND table_schema = 'thehealthshop'
  ) THEN
    ALTER TABLE manager_branches 
    ADD CONSTRAINT fk_manager_branches_location 
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add a view for manager dashboard summary (only if required tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'manager_branches') 
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'locations')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'inventory') THEN
    
    -- Create view with conditional sales_transactions reference
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'sales_transactions') THEN
      -- Full view with sales data
      CREATE OR REPLACE VIEW manager_branch_summary AS
      SELECT 
        mb.user_id as manager_id,
        l.id as location_id,
        l.name as location_name,
        l.type as location_type,
        l.address,
        l.contact_number,
        COALESCE(inv_stats.total_items, 0) as total_items,
        COALESCE(inv_stats.total_value, 0) as total_inventory_value,
        COALESCE(sales_today.total_sales, 0) as sales_today,
        COALESCE(pending_transfers.count, 0) as pending_transfers,
        COALESCE(low_stock.count, 0) as low_stock_items
      FROM manager_branches mb
      JOIN locations l ON mb.location_id = l.id
      LEFT JOIN (
        SELECT 
          location_id,
          COUNT(*) as total_items,
          SUM(quantity * unit_cost) as total_value
        FROM inventory 
        WHERE quantity > 0
        GROUP BY location_id
      ) inv_stats ON l.id = inv_stats.location_id
      LEFT JOIN (
        SELECT 
          location_id,
          SUM(total_amount) as total_sales
        FROM sales_transactions 
        WHERE DATE(transaction_date) = CURRENT_DATE
        GROUP BY location_id
      ) sales_today ON l.id = sales_today.location_id
      LEFT JOIN (
        SELECT 
          to_location_id as location_id,
          COUNT(*) as count
        FROM transfers 
        WHERE status = 'pending' AND requires_manager_approval = true
        GROUP BY to_location_id
      ) pending_transfers ON l.id = pending_transfers.location_id
      LEFT JOIN (
        SELECT 
          location_id,
          COUNT(*) as count
        FROM inventory 
        WHERE quantity <= 10 AND quantity > 0
        GROUP BY location_id
      ) low_stock ON l.id = low_stock.location_id;
    ELSE
      -- Simplified view without sales data
      CREATE OR REPLACE VIEW manager_branch_summary AS
      SELECT 
        mb.user_id as manager_id,
        l.id as location_id,
        l.name as location_name,
        l.type as location_type,
        l.address,
        l.contact_number,
        COALESCE(inv_stats.total_items, 0) as total_items,
        COALESCE(inv_stats.total_value, 0) as total_inventory_value,
        0 as sales_today,
        COALESCE(pending_transfers.count, 0) as pending_transfers,
        COALESCE(low_stock.count, 0) as low_stock_items
      FROM manager_branches mb
      JOIN locations l ON mb.location_id = l.id
      LEFT JOIN (
        SELECT 
          location_id,
          COUNT(*) as total_items,
          SUM(quantity * unit_cost) as total_value
        FROM inventory 
        WHERE quantity > 0
        GROUP BY location_id
      ) inv_stats ON l.id = inv_stats.location_id
      LEFT JOIN (
        SELECT 
          to_location_id as location_id,
          COUNT(*) as count
        FROM transfers 
        WHERE status = 'pending' AND requires_manager_approval = true
        GROUP BY to_location_id
      ) pending_transfers ON l.id = pending_transfers.location_id
      LEFT JOIN (
        SELECT 
          location_id,
          COUNT(*) as count
        FROM inventory 
        WHERE quantity <= 10 AND quantity > 0
        GROUP BY location_id
      ) low_stock ON l.id = low_stock.location_id;
    END IF;
    
    RAISE NOTICE 'Created manager_branch_summary view';
  ELSE
    RAISE NOTICE 'Required tables not found, skipping manager_branch_summary view';
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON VIEW manager_branch_summary IS 'Summary view for manager dashboard showing key metrics for each managed branch';

-- Add notification preferences for managers (optional future enhancement)
CREATE TABLE IF NOT EXISTS manager_notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'transfer_approval', 'delivery_confirmation', 'low_stock', etc.
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, notification_type)
);

-- Insert default notification preferences for existing managers
INSERT INTO manager_notification_preferences (user_id, notification_type, enabled)
SELECT u.id, unnest(ARRAY['transfer_approval', 'delivery_confirmation', 'low_stock', 'daily_summary']), true
FROM users u 
WHERE u.role = 'branch_manager'
ON CONFLICT (user_id, notification_type) DO NOTHING;

-- Add indexes for notification preferences
CREATE INDEX IF NOT EXISTS idx_manager_notifications_user ON manager_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_manager_notifications_type ON manager_notification_preferences(notification_type);

-- Add audit trail for manager actions
CREATE TABLE IF NOT EXISTS manager_actions (
  id SERIAL PRIMARY KEY,
  manager_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL, -- 'approve_transfer', 'confirm_delivery', 'assign_branch', etc.
  target_type VARCHAR(50) NOT NULL, -- 'transfer', 'delivery', 'branch', etc.
  target_id INTEGER NOT NULL,
  location_id INTEGER REFERENCES locations(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

-- Add indexes for manager actions
CREATE INDEX IF NOT EXISTS idx_manager_actions_manager ON manager_actions(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_actions_type ON manager_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_manager_actions_date ON manager_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_manager_actions_location ON manager_actions(location_id);

-- Add comments
COMMENT ON TABLE manager_actions IS 'Audit trail for manager-specific actions like approvals and confirmations';
COMMENT ON TABLE manager_notification_preferences IS 'Notification preferences for branch managers';

-- Update existing transfers to ensure proper manager approval workflow
UPDATE transfers 
SET requires_manager_approval = true 
WHERE transferred_by IN (
  SELECT id FROM users WHERE role = 'branch_staff'
) AND requires_manager_approval IS NULL;

-- Update existing deliveries to ensure proper manager confirmation workflow  
UPDATE deliveries 
SET requires_manager_approval = true 
WHERE created_by IN (
  SELECT id FROM users WHERE role = 'branch_staff'
) AND requires_manager_approval IS NULL;

-- Add a function to get manager locations (for use in queries)
CREATE OR REPLACE FUNCTION get_manager_locations(manager_user_id INTEGER)
RETURNS TABLE(location_id INTEGER, location_name VARCHAR, location_type VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.name, l.type
  FROM locations l
  WHERE l.id IN (
    -- Primary location
    SELECT u.location_id FROM users u WHERE u.id = manager_user_id AND u.location_id IS NOT NULL
    UNION
    -- Assigned branches
    SELECT mb.location_id FROM manager_branches mb WHERE mb.user_id = manager_user_id
  )
  ORDER BY l.name;
END;
$$ LANGUAGE plpgsql;

-- Add comment for the function
COMMENT ON FUNCTION get_manager_locations(INTEGER) IS 'Returns all locations (primary + assigned branches) that a manager has access to';

-- Create a trigger to automatically log manager actions
CREATE OR REPLACE FUNCTION log_manager_action()
RETURNS TRIGGER AS $$
BEGIN
  -- Log transfer approvals
  IF TG_TABLE_NAME = 'transfers' AND OLD.manager_approved_by IS NULL AND NEW.manager_approved_by IS NOT NULL THEN
    INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
    VALUES (NEW.manager_approved_by, 'approve_transfer', 'transfer', NEW.id, NEW.to_location_id, 'Transfer approved by manager');
  END IF;
  
  -- Log delivery confirmations
  IF TG_TABLE_NAME = 'deliveries' AND OLD.manager_confirmed_by IS NULL AND NEW.manager_confirmed_by IS NOT NULL THEN
    INSERT INTO manager_actions (manager_id, action_type, target_type, target_id, location_id, notes)
    VALUES (NEW.manager_confirmed_by, 'confirm_delivery', 'delivery', NEW.id, NEW.to_location_id, 'Delivery confirmed by manager');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic logging
DROP TRIGGER IF EXISTS trigger_log_transfer_manager_actions ON transfers;
CREATE TRIGGER trigger_log_transfer_manager_actions
  AFTER UPDATE ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION log_manager_action();

DROP TRIGGER IF EXISTS trigger_log_delivery_manager_actions ON deliveries;  
CREATE TRIGGER trigger_log_delivery_manager_actions
  AFTER UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION log_manager_action();

-- Add a view for manager performance metrics (optional - only if sales_transactions exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'thehealthshop' AND table_name = 'sales_transactions') THEN
    CREATE OR REPLACE VIEW manager_performance_metrics AS
    SELECT 
      u.id as manager_id,
      u.full_name as manager_name,
      COUNT(DISTINCT mb.location_id) as branches_managed,
      COUNT(ma_transfers.id) as transfers_approved_this_month,
      COUNT(ma_deliveries.id) as deliveries_confirmed_this_month,
      COALESCE(SUM(branch_sales.total_sales), 0) as total_sales_this_month,
      COALESCE(SUM(branch_inventory.total_value), 0) as total_inventory_value
    FROM users u
    LEFT JOIN manager_branches mb ON u.id = mb.user_id
    LEFT JOIN manager_actions ma_transfers ON u.id = ma_transfers.manager_id 
      AND ma_transfers.action_type = 'approve_transfer'
      AND ma_transfers.created_at >= DATE_TRUNC('month', CURRENT_DATE)
    LEFT JOIN manager_actions ma_deliveries ON u.id = ma_deliveries.manager_id 
      AND ma_deliveries.action_type = 'confirm_delivery'
      AND ma_deliveries.created_at >= DATE_TRUNC('month', CURRENT_DATE)
    LEFT JOIN (
      SELECT 
        st.location_id,
        SUM(st.total_amount) as total_sales
      FROM sales_transactions st
      WHERE st.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY st.location_id
    ) branch_sales ON mb.location_id = branch_sales.location_id
    LEFT JOIN (
      SELECT 
        i.location_id,
        SUM(i.quantity * i.unit_cost) as total_value
      FROM inventory i
      WHERE i.quantity > 0
      GROUP BY i.location_id
    ) branch_inventory ON mb.location_id = branch_inventory.location_id
    WHERE u.role = 'branch_manager'
    GROUP BY u.id, u.full_name;
    
    RAISE NOTICE 'Created manager_performance_metrics view';
  ELSE
    RAISE NOTICE 'sales_transactions table not found, skipping manager_performance_metrics view';
  END IF;
END $$;

-- Add comment for the performance view
COMMENT ON VIEW manager_performance_metrics IS 'Performance metrics for branch managers including approvals, sales, and inventory managed';

-- Final success message
DO $$
BEGIN
  RAISE NOTICE 'Manager features enhancement completed successfully!';
  RAISE NOTICE 'Added indexes for better performance';
  RAISE NOTICE 'Created manager dashboard views and functions';
  RAISE NOTICE 'Added audit trail for manager actions';
  RAISE NOTICE 'Enhanced notification preferences system';
END $$;