-- Add platform-configurable branch and user limits to shop_details
ALTER TABLE shop_details ADD COLUMN IF NOT EXISTS max_branches INTEGER DEFAULT NULL;
ALTER TABLE shop_details ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT NULL;
