-- Add full_name column to users table if it doesn't exist

-- Check if column exists and add it if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'full_name'
    ) THEN
        ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
        
        -- Update existing users to have full_name = username as default
        UPDATE users SET full_name = username WHERE full_name IS NULL;
        
        -- Make it NOT NULL after populating
        ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;
        
        RAISE NOTICE 'full_name column added to users table';
    ELSE
        RAISE NOTICE 'full_name column already exists';
    END IF;
END $$;
