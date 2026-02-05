-- The Health Shop Inventory System Database Schema

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'warehouse', 'branch_manager', 'branch_staff')),
  location_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Locations table (branches and warehouses)
CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('warehouse', 'branch')),
  address TEXT,
  contact_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory table
CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(10, 2) NOT NULL,
  suggested_selling_price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(location_id, description, unit)
);

-- Transfers table (warehouse to branch, branch to branch)
CREATE TABLE transfers (
  id SERIAL PRIMARY KEY,
  from_location_id INTEGER REFERENCES locations(id),
  to_location_id INTEGER REFERENCES locations(id),
  inventory_id INTEGER REFERENCES inventory(id),
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  transferred_by INTEGER REFERENCES users(id),
  notes TEXT
);

-- Sales table
CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id),
  inventory_id INTEGER REFERENCES inventory(id),
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  selling_price DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold_by INTEGER REFERENCES users(id),
  customer_name VARCHAR(255),
  notes TEXT
);

-- Indexes for better performance
CREATE INDEX idx_inventory_location ON inventory(location_id);
CREATE INDEX idx_transfers_from ON transfers(from_location_id);
CREATE INDEX idx_transfers_to ON transfers(to_location_id);
CREATE INDEX idx_sales_location ON sales(location_id);
CREATE INDEX idx_users_location ON users(location_id);

-- Insert default admin user (password: admin123 - CHANGE THIS!)
INSERT INTO users (username, password, full_name, role) 
VALUES ('admin', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8YqZ9vXqZ9vXqZ9vXqZ9vXqZ9vXqZ9', 'System Administrator', 'admin');
