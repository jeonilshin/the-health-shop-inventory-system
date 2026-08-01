-- Delivery reservation model
-- Standalone deliveries (transfer_id IS NULL) now deduct warehouse stock the moment
-- the delivery is created/sent ("reserved"), and only add it to the branch when the
-- branch receives (accepts). These columns record what was reserved so that:
--   * accept can recreate the destination lots with correct cost/batch/expiry, and
--   * edit / delete / reject can restore the exact quantities back to the source.

-- Exact source-batch breakdown consumed when the delivery was reserved:
-- [{ cost_batch_id, quantity, unit_cost, suggested_selling_price, batch_number, expiry_date }]
ALTER TABLE thehealthshop.delivery_items
  ADD COLUMN IF NOT EXISTS reserved_batches JSONB;

-- Guard flag so we never release/restore reserved stock twice.
ALTER TABLE thehealthshop.deliveries
  ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN DEFAULT FALSE;
