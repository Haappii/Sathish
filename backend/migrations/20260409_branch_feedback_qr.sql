ALTER TABLE branch ADD COLUMN IF NOT EXISTS feedback_qr_enabled BOOLEAN DEFAULT TRUE;
UPDATE branch SET feedback_qr_enabled = TRUE WHERE feedback_qr_enabled IS NULL;
