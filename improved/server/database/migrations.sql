-- Migrations: additional tables for full feature parity

-- Add suggested_price to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS suggested_price DECIMAL(12,2);

-- Stock withdrawals (employee purchase, principal, outside party, etc.)
CREATE TABLE IF NOT EXISTS stock_withdrawals (
  id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  withdrawn_by INTEGER NOT NULL REFERENCES users(id),
  withdrawal_type VARCHAR(50) NOT NULL DEFAULT 'other'
    CHECK (withdrawal_type IN ('employee_purchase','principal','outside_party','expired','damaged','other')),
  reason TEXT,
  total_value DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_location ON stock_withdrawals(location_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON stock_withdrawals(withdrawn_by);

CREATE TABLE IF NOT EXISTS stock_withdrawal_items (
  id SERIAL PRIMARY KEY,
  withdrawal_id INTEGER NOT NULL REFERENCES stock_withdrawals(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(12,2),
  batch_number VARCHAR(100),
  expiry_date DATE,
  subtotal DECIMAL(12,2)
);

-- Unit conversions (product-level: e.g. 1 box = 12 pieces)
CREATE TABLE IF NOT EXISTS unit_conversions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_unit VARCHAR(50) NOT NULL,
  to_unit VARCHAR(50) NOT NULL,
  factor DECIMAL(14,6) NOT NULL CHECK (factor > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, from_unit, to_unit)
);

CREATE INDEX IF NOT EXISTS idx_unit_conv_product ON unit_conversions(product_id);
