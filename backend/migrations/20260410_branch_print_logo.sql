-- Add print_logo_enabled column to branch table
ALTER TABLE branch ADD COLUMN IF NOT EXISTS print_logo_enabled BOOLEAN DEFAULT TRUE;
UPDATE branch SET print_logo_enabled = TRUE WHERE print_logo_enabled IS NULL;
