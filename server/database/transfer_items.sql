-- Create transfer_items table for multi-item transfers
CREATE TABLE IF NOT EXISTS transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER REFERENCES transfers(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON transfer_items(transfer_id);

-- Migrate existing single-item transfers to transfer_items
INSERT INTO transfer_items (transfer_id, description, unit, quantity, unit_cost)
SELECT id, description, unit, quantity, unit_cost
FROM transfers
WHERE description IS NOT NULL;

-- Note: Keep description, unit, quantity, unit_cost columns in transfers table for backward compatibility
-- New transfers will use transfer_items table
