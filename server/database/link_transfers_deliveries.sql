-- Link transfers to deliveries
ALTER TABLE thehealthshop.deliveries ADD COLUMN IF NOT EXISTS transfer_id INTEGER REFERENCES thehealthshop.transfers(id);
ALTER TABLE thehealthshop.deliveries ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);
ALTER TABLE thehealthshop.deliveries ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE thehealthshop.deliveries ADD COLUMN IF NOT EXISTS admin_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE thehealthshop.deliveries ADD COLUMN IF NOT EXISTS admin_confirmed_by INTEGER REFERENCES thehealthshop.users(id);
ALTER TABLE thehealthshop.deliveries ADD COLUMN IF NOT EXISTS admin_confirmed_at TIMESTAMP;

-- Update delivery_items to include unit_cost
ALTER TABLE thehealthshop.delivery_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);

-- Add index for transfer_id
CREATE INDEX IF NOT EXISTS idx_deliveries_transfer ON thehealthshop.deliveries(transfer_id);

-- Update status check to include new statuses
ALTER TABLE thehealthshop.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE thehealthshop.deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending', 'awaiting_admin', 'admin_confirmed', 'in_transit', 'pending_manager_confirmation', 'delivered', 'cancelled', 'rejected'));
