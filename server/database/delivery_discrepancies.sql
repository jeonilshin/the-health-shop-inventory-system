-- Migration: Delivery Discrepancies & Return Requests
-- Tracks shortage reports (received less than delivered) and return requests (send items back to warehouse)

CREATE TABLE IF NOT EXISTS delivery_discrepancies (
  id                   SERIAL PRIMARY KEY,
  type                 VARCHAR(20)   NOT NULL DEFAULT 'shortage',   -- 'shortage' | 'return'
  delivery_id          INTEGER       REFERENCES deliveries(id) ON DELETE SET NULL,
  item_description     TEXT          NOT NULL,
  unit                 TEXT          NOT NULL,
  unit_cost            NUMERIC(10,2),
  expected_quantity    NUMERIC(10,4) NOT NULL,   -- shortage: delivery qty; return: same as received_quantity
  received_quantity    NUMERIC(10,4) NOT NULL,   -- shortage: actually received; return: quantity to send back
  note                 TEXT          NOT NULL,   -- always required
  branch_location_id   INTEGER       NOT NULL REFERENCES locations(id),
  warehouse_location_id INTEGER      NOT NULL REFERENCES locations(id),
  status               VARCHAR(20)   NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected' | 'completed'
  reported_by          INTEGER       NOT NULL REFERENCES users(id),
  reported_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_by          INTEGER       REFERENCES users(id),
  resolved_at          TIMESTAMP,
  admin_note           TEXT,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_discrepancy_status CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  CONSTRAINT chk_discrepancy_type   CHECK (type   IN ('shortage', 'return'))
);

CREATE INDEX IF NOT EXISTS idx_disc_delivery   ON delivery_discrepancies(delivery_id);
CREATE INDEX IF NOT EXISTS idx_disc_branch     ON delivery_discrepancies(branch_location_id);
CREATE INDEX IF NOT EXISTS idx_disc_warehouse  ON delivery_discrepancies(warehouse_location_id);
CREATE INDEX IF NOT EXISTS idx_disc_status     ON delivery_discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_disc_reported   ON delivery_discrepancies(reported_at DESC);
