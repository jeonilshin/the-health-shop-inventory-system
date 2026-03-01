-- Sales Transactions System
-- Create sales_transactions table for recording individual sales

CREATE TABLE IF NOT EXISTS sales_transactions (
  id SERIAL PRIMARY KEY,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  
  -- Item details
  item_description VARCHAR(255) NOT NULL,
  item_unit VARCHAR(50) NOT NULL,
  quantity_sold DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  
  -- Payment details
  payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'gcash', 'maya', 'credit_card', 'other')),
  
  -- User tracking
  sold_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sold_by_name VARCHAR(100),
  
  -- Additional info
  customer_name VARCHAR(255),
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_sales_transactions_date ON sales_transactions(transaction_date);
CREATE INDEX idx_sales_transactions_location ON sales_transactions(location_id);
CREATE INDEX idx_sales_transactions_sold_by ON sales_transactions(sold_by);
CREATE INDEX idx_sales_transactions_item ON sales_transactions(item_description);

-- Verify
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'sales_transactions';
