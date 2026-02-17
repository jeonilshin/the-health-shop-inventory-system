-- Update transfers table to support approval workflow
ALTER TABLE transfers 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_transit', 'delivered', 'rejected', 'cancelled'));

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS delivered_by INTEGER REFERENCES users(id);

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add index for status
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

-- Update existing transfers to 'delivered' status
UPDATE transfers SET status = 'delivered' WHERE status IS NULL;
