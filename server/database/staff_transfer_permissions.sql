-- Add fields to track staff-initiated transfers that need manager approval

ALTER TABLE transfers 
ADD COLUMN IF NOT EXISTS requires_manager_approval BOOLEAN DEFAULT FALSE;

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS manager_approved_by INTEGER REFERENCES users(id);

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMP;

-- Add similar fields for deliveries
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS requires_manager_approval BOOLEAN DEFAULT FALSE;

ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS manager_confirmed_by INTEGER REFERENCES users(id);

ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS manager_confirmed_at TIMESTAMP;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transfers_manager_approval ON transfers(requires_manager_approval) WHERE requires_manager_approval = TRUE;
CREATE INDEX IF NOT EXISTS idx_deliveries_manager_approval ON deliveries(requires_manager_approval) WHERE requires_manager_approval = TRUE;

-- Add comments
COMMENT ON COLUMN transfers.requires_manager_approval IS 'TRUE when staff creates transfer and needs manager approval';
COMMENT ON COLUMN transfers.manager_approved_by IS 'Manager who approved the staff transfer request';
COMMENT ON COLUMN deliveries.requires_manager_approval IS 'TRUE when staff accepts delivery and needs manager confirmation';
COMMENT ON COLUMN deliveries.manager_confirmed_by IS 'Manager who confirmed the staff delivery acceptance';
