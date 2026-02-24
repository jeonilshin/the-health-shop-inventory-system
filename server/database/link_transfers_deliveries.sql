-- Link transfers to deliveries
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS transfer_id INTEGER REFERENCES transfers(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS admin_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS admin_confirmed_by INTEGER REFERENCES users(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS admin_confirmed_at TIMESTAMP;

-- Update delivery_items to include unit_cost
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);

-- Add index for transfer_id
CREATE INDEX IF NOT EXISTS idx_deliveries_transfer ON deliveries(transfer_id);

-- Update status check to include new statuses
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check 
  CHECK (status IN ('pending', 'awaiting_admin', 'admin_confirmed', 'in_transit', 'delivered', 'cancelled'));
