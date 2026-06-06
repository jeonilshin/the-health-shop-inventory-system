CREATE TABLE IF NOT EXISTS delivery_discrepancies (
  id                   SERIAL PRIMARY KEY,
  type                 VARCHAR(20) NOT NULL CHECK (type IN ('shortage','overage','return','damage')),
  delivery_id          INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
  item_description     VARCHAR(255) NOT NULL,
  unit                 VARCHAR(50)  NOT NULL,
  unit_cost            NUMERIC(10,2) DEFAULT 0,
  expected_quantity    NUMERIC(10,2) NOT NULL,
  received_quantity    NUMERIC(10,2) NOT NULL,
  note                 TEXT NOT NULL,
  admin_note           TEXT,
  branch_location_id   INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  warehouse_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  reported_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','completed','rejected')),
  reported_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dd_status         ON delivery_discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_dd_type           ON delivery_discrepancies(type);
CREATE INDEX IF NOT EXISTS idx_dd_branch         ON delivery_discrepancies(branch_location_id);
CREATE INDEX IF NOT EXISTS idx_dd_warehouse      ON delivery_discrepancies(warehouse_location_id);
CREATE INDEX IF NOT EXISTS idx_dd_delivery       ON delivery_discrepancies(delivery_id);
CREATE INDEX IF NOT EXISTS idx_dd_reported_at    ON delivery_discrepancies(reported_at DESC);
