CREATE TABLE IF NOT EXISTS advance_orders (
  order_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  branch_id INTEGER NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(20),
  order_items JSONB,
  expected_date DATE NOT NULL,
  expected_time VARCHAR(10),
  notes TEXT,
  total_amount NUMERIC(12,2) DEFAULT 0,
  advance_amount NUMERIC(12,2) DEFAULT 0,
  advance_payment_mode VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  cancel_reason VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES users(user_id)
);

ALTER TABLE advance_orders
  ADD COLUMN IF NOT EXISTS shop_id INTEGER,
  ADD COLUMN IF NOT EXISTS branch_id INTEGER,
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS order_items JSONB,
  ADD COLUMN IF NOT EXISTS expected_date DATE,
  ADD COLUMN IF NOT EXISTS expected_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_payment_mode VARCHAR(30),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(200),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_by INTEGER;

CREATE INDEX IF NOT EXISTS idx_advance_orders_shop ON advance_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_advance_orders_date ON advance_orders(expected_date);
CREATE INDEX IF NOT EXISTS idx_advance_orders_status ON advance_orders(status);
CREATE INDEX IF NOT EXISTS idx_advance_orders_branch ON advance_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_advance_orders_phone ON advance_orders(customer_phone);
