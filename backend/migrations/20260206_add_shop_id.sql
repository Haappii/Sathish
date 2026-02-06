-- Add shop_id to all business tables and backfill existing rows
-- Assumes existing shop_details row has shop_id = 1 for current data

BEGIN;

-- USERS
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE users SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE users ALTER COLUMN shop_id SET NOT NULL;

-- BRANCH
ALTER TABLE branch ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE branch SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE branch ALTER COLUMN shop_id SET NOT NULL;

-- CATEGORY
ALTER TABLE category ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE category SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE category ALTER COLUMN shop_id SET NOT NULL;

-- ITEMS
ALTER TABLE items ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE items SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE items ALTER COLUMN shop_id SET NOT NULL;

-- INVOICE + DETAILS
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE invoice SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE invoice ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE invoice_details ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE invoice_details SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE invoice_details ALTER COLUMN shop_id SET NOT NULL;

-- INVOICE ARCHIVE
ALTER TABLE invoice_archive ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE invoice_archive SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE invoice_archive ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE invoice_archive_details ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE invoice_archive_details SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE invoice_archive_details ALTER COLUMN shop_id SET NOT NULL;

-- AUDIT LOG
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE audit_log SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE audit_log ALTER COLUMN shop_id SET NOT NULL;

-- EXPENSES
ALTER TABLE branch_expenses ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE branch_expenses SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE branch_expenses ALTER COLUMN shop_id SET NOT NULL;

-- STOCK
ALTER TABLE stock ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE stock SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE stock ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE stock_ledger SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE stock_ledger ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE date_wise_stock ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE date_wise_stock SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE date_wise_stock ALTER COLUMN shop_id SET NOT NULL;

-- DAY CLOSE / MONTH CLOSE
ALTER TABLE branch_day_close ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE branch_day_close SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE branch_day_close ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE shop_day_close ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE shop_day_close SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE shop_day_close ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE branch_month_close ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE branch_month_close SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE branch_month_close ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE shop_month_close ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE shop_month_close SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE shop_month_close ALTER COLUMN shop_id SET NOT NULL;

-- SUPPLIERS / PO
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE supplier SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE supplier ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE purchase_orders SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE purchase_orders ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE purchase_order_items SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE purchase_order_items ALTER COLUMN shop_id SET NOT NULL;

-- SYSTEM PARAMETERS
ALTER TABLE system_parameters ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE system_parameters SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE system_parameters ALTER COLUMN shop_id SET NOT NULL;

-- TABLE BILLING
ALTER TABLE tables_master ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE tables_master SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE tables_master ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE orders SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE orders ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS shop_id INTEGER;
UPDATE order_items SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE order_items ALTER COLUMN shop_id SET NOT NULL;

-- UNIQUE PARAM KEY PER SHOP
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'system_parameters_param_key_key'
  ) THEN
    ALTER TABLE system_parameters DROP CONSTRAINT system_parameters_param_key_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'system_parameters_shop_param_key'
  ) THEN
    ALTER TABLE system_parameters
      ADD CONSTRAINT system_parameters_shop_param_key UNIQUE (shop_id, param_key);
  END IF;
END $$;

COMMIT;
