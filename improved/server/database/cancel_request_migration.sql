-- Add cancel request workflow columns to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_requested_by INTEGER REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_request_reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

-- Expand status to include cancel_requested (drop old constraint first)
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check
  CHECK (status IN ('completed', 'cancelled', 'cancel_requested'));
