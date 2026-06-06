CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'piece',
  category VARCHAR(100),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('warehouse', 'branch')),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'warehouse', 'manager', 'staff', 'audit')),
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2),
  batch_number VARCHAR(100),
  expiry_date DATE,
  received_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT inventory_qty_non_negative CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_location ON inventory(product_id, location_id);

CREATE TABLE IF NOT EXISTS transfers (
  id SERIAL PRIMARY KEY,
  from_location_id INTEGER NOT NULL REFERENCES locations(id),
  to_location_id INTEGER NOT NULL REFERENCES locations(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  received_by INTEGER REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','shipped','received','rejected','cancelled')),
  notes TEXT,
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

CREATE TABLE IF NOT EXISTS transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_sent DECIMAL(12,3) NOT NULL CHECK (quantity_sent > 0),
  quantity_received DECIMAL(12,3),
  unit_cost DECIMAL(12,2),
  batch_number VARCHAR(100),
  expiry_date DATE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  sold_by INTEGER NOT NULL REFERENCES users(id),
  customer_name VARCHAR(255),
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2),
  subtotal DECIMAL(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  action_type VARCHAR(50) NOT NULL,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  performer_name VARCHAR(255),
  performer_role VARCHAR(20),
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  location_name VARCHAR(255),
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255),
  reference_type VARCHAR(20),
  reference_id INTEGER,
  quantity_before DECIMAL(12,3),
  quantity_after DECIMAL(12,3),
  quantity_change DECIMAL(12,3),
  unit_cost DECIMAL(12,2),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_location ON activity_log(location_id);
CREATE INDEX IF NOT EXISTS idx_activity_product ON activity_log(product_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_performer ON activity_log(performed_by);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
  reference_type VARCHAR(20),
  reference_id INTEGER,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS manager_branches (
  manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (manager_id, location_id)
);
