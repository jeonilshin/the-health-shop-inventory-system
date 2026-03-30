-- Migration: Sale Cancellation Requests
-- Allows branch staff/managers to cancel a wrong sale immediately (inventory restored at once)
-- Admin can then approve (acknowledge) or reject (re-deduct inventory, restore the sale)

ALTER TABLE sales_transactions
  ADD COLUMN IF NOT EXISTS cancellation_status  VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by          INTEGER      REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at          TIMESTAMP    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason   TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancel_reviewed_by    INTEGER      REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancel_reviewed_at    TIMESTAMP    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancel_admin_note     TEXT         DEFAULT NULL;

ALTER TABLE sales_transactions
  ADD CONSTRAINT chk_cancellation_status
    CHECK (cancellation_status IN ('pending', 'approved', 'rejected') OR cancellation_status IS NULL);

CREATE INDEX IF NOT EXISTS idx_sales_cancellation ON sales_transactions(cancellation_status)
  WHERE cancellation_status IS NOT NULL;
