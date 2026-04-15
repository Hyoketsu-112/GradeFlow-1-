-- =============================================================================
-- SUPABASE SETUP: Add Login Timestamp Columns
-- =============================================================================
-- Run this in your Supabase Dashboard → SQL Editor
-- This enables tracking when users last logged in

-- Step 1: Add columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Step 2: Create auto-update function for updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Attach trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at_trigger ON users;
CREATE TRIGGER update_users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_updated_at();

-- Step 4: Verify columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('last_login', 'updated_at', 'email', 'name');

-- Expected output:
-- last_login  | timestamp without time zone | YES
-- updated_at  | timestamp without time zone | NO
-- email       | character varying           | YES
-- name        | character varying           | YES
