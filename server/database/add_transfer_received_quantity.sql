-- Migration: track the actual quantity a branch received for a transfer.
-- Lets us correct a completed (delivered) transfer against a real baseline
-- instead of assuming the branch received exactly what was sent.

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(10,4);

-- Backfill existing delivered transfers: assume they received the full sent qty.
UPDATE transfers
   SET received_quantity = quantity
 WHERE status = 'delivered'
   AND received_quantity IS NULL;
