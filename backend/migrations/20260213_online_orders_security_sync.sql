-- Online orders + webhook/security + status sync support

-- 1) Increase system parameter value capacity for URLs, tokens, secrets
ALTER TABLE system_parameters
  ALTER COLUMN param_value TYPE VARCHAR(500);

-- 2) Online orders master table
CREATE TABLE IF NOT EXISTS online_orders (
  online_order_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  branch_id INTEGER NULL REFERENCES branch(branch_id),
  provider VARCHAR(20) NOT NULL,
  partner_id VARCHAR(80) NULL,
  provider_order_id VARCHAR(120) NOT NULL,
  provider_order_number VARCHAR(120) NULL,
  source_created_at TIMESTAMPTZ NULL,
  order_type VARCHAR(20) NOT NULL DEFAULT 'DELIVERY',
  status VARCHAR(30) NOT NULL DEFAULT 'NEW',
  customer_name VARCHAR(150) NULL,
  customer_mobile VARCHAR(30) NULL,
  customer_address TEXT NULL,
  subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  packaging_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(30) NULL,
  payment_status VARCHAR(30) NULL,
  notes TEXT NULL,
  webhook_event VARCHAR(60) NULL,
  raw_payload JSONB NULL,
  accepted_at TIMESTAMPTZ NULL,
  dispatched_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  invoice_id INTEGER NULL REFERENCES invoice(invoice_id),
  created_by INTEGER NULL REFERENCES users(user_id),
  updated_by INTEGER NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_online_orders_provider_ref'
  ) THEN
    ALTER TABLE online_orders
      ADD CONSTRAINT uq_online_orders_provider_ref
      UNIQUE (shop_id, provider, provider_order_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_online_orders_shop_status
  ON online_orders (shop_id, status);
CREATE INDEX IF NOT EXISTS ix_online_orders_shop_created
  ON online_orders (shop_id, created_at);

-- 3) Online order items
CREATE TABLE IF NOT EXISTS online_order_items (
  order_item_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  online_order_id INTEGER NOT NULL REFERENCES online_orders(online_order_id) ON DELETE CASCADE,
  item_id INTEGER NULL REFERENCES items(item_id),
  provider_item_id VARCHAR(120) NULL,
  item_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes VARCHAR(300) NULL
);

CREATE INDEX IF NOT EXISTS ix_online_order_items_shop_order
  ON online_order_items (shop_id, online_order_id);

-- 4) Online order events (audit / timeline)
CREATE TABLE IF NOT EXISTS online_order_events (
  event_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  online_order_id INTEGER NOT NULL REFERENCES online_orders(online_order_id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  provider_status VARCHAR(40) NULL,
  message VARCHAR(300) NULL,
  payload JSONB NULL,
  actor_user_id INTEGER NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_online_order_events_shop_order
  ON online_order_events (shop_id, online_order_id);
