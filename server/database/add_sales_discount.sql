-- Migration: Add Discount Support to Sales Transactions
-- Run this in your database console

-- Add discount columns to sales_transactions table
ALTER TABLE sales_transactions 
ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_reason VARCHAR(255);

-- Add comments for clarity
COMMENT ON COLUMN sales_transactions.discount_percent IS 'Discount percentage applied (0-100)';
COMMENT ON COLUMN sales_transactions.discount_amount IS 'Actual discount amount in currency';
COMMENT ON COLUMN sales_transactions.discount_reason IS 'Reason for discount (PWD, Senior, Holiday Promo, etc.)';

-- Verify the changes
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'sales_transactions' 
  AND column_name IN ('discount_percent', 'discount_amount', 'discount_reason');
