-- Add max_items limit to shop_details (null = unlimited)
ALTER TABLE shop_details ADD COLUMN IF NOT EXISTS max_items INTEGER DEFAULT NULL;
