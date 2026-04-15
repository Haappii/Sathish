-- Create shop_modules table for per-shop feature module enable/disable
CREATE TABLE IF NOT EXISTS shop_modules (
  id         SERIAL PRIMARY KEY,
  shop_id    INTEGER NOT NULL REFERENCES shop_details(shop_id) ON DELETE CASCADE,
  module_key VARCHAR(80) NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_shop_modules_shop_module UNIQUE (shop_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_shop_modules_shop_id ON shop_modules(shop_id);
