-- Migration: Stock Withdrawals (a.k.a. Pull-outs)
--
-- Records every stock-out that is NOT a customer sale. The three categories
-- the client cares about:
--   * employee_purchase  – staff bought the item for themselves
--   * principal          – owner or principal stakeholder took the item
--   * outside_party      – DFA or any other external recipient
--
-- A withdrawal immediately deducts the inventory at the source location.
-- Admin sees every withdrawal on the Stock Withdrawal page.
--
-- The app's connection sets search_path to thehealthshop, but Supabase's SQL
-- editor defaults to public, so we set it explicitly here as well.

SET search_path TO thehealthshop, public;

CREATE TABLE IF NOT EXISTS thehealthshop.stock_withdrawals (
  id                 SERIAL PRIMARY KEY,
  location_id        INTEGER       NOT NULL REFERENCES thehealthshop.locations(id) ON DELETE CASCADE,
  inventory_id       INTEGER       REFERENCES thehealthshop.inventory(id) ON DELETE SET NULL,
  item_description   TEXT          NOT NULL,
  unit               VARCHAR(50)   NOT NULL,
  quantity           NUMERIC(10,4) NOT NULL CHECK (quantity > 0),
  unit_cost          NUMERIC(10,2),
  withdrawal_type    VARCHAR(30)   NOT NULL,
  recipient_name     VARCHAR(255)  NOT NULL,
  notes              TEXT,
  withdrawn_by       INTEGER       REFERENCES thehealthshop.users(id) ON DELETE SET NULL,
  withdrawn_by_name  VARCHAR(255),
  withdrawn_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_stock_withdrawal_type
    CHECK (withdrawal_type IN ('employee_purchase', 'principal', 'outside_party'))
);

CREATE INDEX IF NOT EXISTS idx_stock_withdrawals_location
  ON thehealthshop.stock_withdrawals(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_withdrawals_user
  ON thehealthshop.stock_withdrawals(withdrawn_by);
CREATE INDEX IF NOT EXISTS idx_stock_withdrawals_date
  ON thehealthshop.stock_withdrawals(withdrawn_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_withdrawals_type
  ON thehealthshop.stock_withdrawals(withdrawal_type);
