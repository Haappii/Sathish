-- Add demo/expiry support for platform-owner demo provisioning.

ALTER TABLE IF EXISTS shop_details
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_on DATE;

ALTER TABLE IF EXISTS support_tickets
  ADD COLUMN IF NOT EXISTS provisioned_shop_id INTEGER,
  ADD COLUMN IF NOT EXISTS provisioned_branch_id INTEGER,
  ADD COLUMN IF NOT EXISTS provisioned_admin_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS provisioned_expires_on DATE,
  ADD COLUMN IF NOT EXISTS decided_by VARCHAR(120),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

