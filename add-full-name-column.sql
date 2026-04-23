-- Add full_name column to users table if it doesn't exist
-- This is needed for transfers and other features that display user names

-- Check if column exists and add it if not
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'thehealthshop' 
        AND table_name = 'users' 
        AND column_name = 'full_name'
    ) THEN
        ALTER TABLE thehealthshop.users 
        ADD COLUMN full_name VARCHAR(255);
        
        -- Populate full_name with username as default for existing users
        UPDATE thehealthshop.users 
        SET full_name = username 
        WHERE full_name IS NULL;
        
        RAISE NOTICE 'Added full_name column to users table';
    ELSE
        RAISE NOTICE 'full_name column already exists';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'thehealthshop' 
AND table_name = 'users'
AND column_name = 'full_name';
