-- Sales Reports System
-- Create sales_reports table for daily, weekly, monthly reports

CREATE TABLE IF NOT EXISTS sales_reports (
  id SERIAL PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_name VARCHAR(100),
  
  -- A. CASH SALES
  cash_beginning DECIMAL(10, 2) DEFAULT 0,
  cash_sales_external DECIMAL(10, 2) DEFAULT 0,
  consignment DECIMAL(10, 2) DEFAULT 0,
  gross_sales DECIMAL(10, 2) DEFAULT 0,
  sales_discount DECIMAL(10, 2) DEFAULT 0,
  sales_return DECIMAL(10, 2) DEFAULT 0,
  total_net_cash_sales DECIMAL(10, 2) DEFAULT 0,
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  other_income DECIMAL(10, 2) DEFAULT 0,
  total_cash_receipts DECIMAL(10, 2) DEFAULT 0,
  
  -- B. CREDIT SALES
  maya_pos_qr DECIMAL(10, 2) DEFAULT 0,
  gcash_qr DECIMAL(10, 2) DEFAULT 0,
  gross_credit_sales DECIMAL(10, 2) DEFAULT 0,
  credit_sales_discount DECIMAL(10, 2) DEFAULT 0,
  credit_sales_return DECIMAL(10, 2) DEFAULT 0,
  total_net_credit_receipts DECIMAL(10, 2) DEFAULT 0,
  
  -- C. DISBURSEMENTS
  meals DECIMAL(10, 2) DEFAULT 0,
  fare DECIMAL(10, 2) DEFAULT 0,
  other_disbursements DECIMAL(10, 2) DEFAULT 0,
  total_disbursements DECIMAL(10, 2) DEFAULT 0,
  
  -- D. NET CASH RECEIPTS
  net_cash_receipts DECIMAL(10, 2) DEFAULT 0,
  actual_cash_deposited DECIMAL(10, 2) DEFAULT 0,
  cash_on_hand_available DECIMAL(10, 2) DEFAULT 0,
  cash_overage_shortage DECIMAL(10, 2) DEFAULT 0,
  cash_beginning_next_day DECIMAL(10, 2) DEFAULT 0,
  
  -- E. SUMMARY
  net_sales DECIMAL(10, 2) DEFAULT 0,
  
  -- Additional fields
  notes TEXT,
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'approved')),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_sales_reports_date ON sales_reports(report_date);
CREATE INDEX idx_sales_reports_location ON sales_reports(location_id);
CREATE INDEX idx_sales_reports_type ON sales_reports(report_type);
CREATE INDEX idx_sales_reports_status ON sales_reports(status);
CREATE INDEX idx_sales_reports_submitted_by ON sales_reports(submitted_by);

-- Unique constraint: one report per location per date per type
CREATE UNIQUE INDEX idx_sales_reports_unique ON sales_reports(location_id, report_date, report_type);

-- Verify
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'sales_reports';
