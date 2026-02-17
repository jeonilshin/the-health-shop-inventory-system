-- Deliveries table for tracking deliveries between locations
CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  from_location_id INTEGER REFERENCES locations(id),
  to_location_id INTEGER REFERENCES locations(id),
  driver_name VARCHAR(255),
  driver_contact VARCHAR(50),
  vehicle_info VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'delivered', 'cancelled')),
  scheduled_date TIMESTAMP,
  delivered_date TIMESTAMP,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery items table (what's being delivered)
CREATE TABLE IF NOT EXISTS delivery_items (
  id SERIAL PRIMARY KEY,
  delivery_id INTEGER REFERENCES deliveries(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deliveries_from ON deliveries(from_location_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_to ON deliveries(to_location_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);
