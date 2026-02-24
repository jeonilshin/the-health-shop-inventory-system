-- Add created_at and updated_at columns to transfers table

-- Add created_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'transfers' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE transfers ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        
        -- Update existing transfers to have created_at = transfer_date
        UPDATE transfers SET created_at = transfer_date WHERE created_at IS NULL;
        
        RAISE NOTICE 'created_at column added to transfers table';
    ELSE
        RAISE NOTICE 'created_at column already exists';
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'transfers' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE transfers ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        
        -- Update existing transfers to have updated_at = transfer_date
        UPDATE transfers SET updated_at = transfer_date WHERE updated_at IS NULL;
        
        RAISE NOTICE 'updated_at column added to transfers table';
    ELSE
        RAISE NOTICE 'updated_at column already exists';
    END IF;
END $$;
