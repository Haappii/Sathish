-- Track the first customer's mobile per table QR session (lock).
-- If a table is already OCCUPIED, only the same mobile can continue ordering via QR.

CREATE TABLE IF NOT EXISTS table_qr_sessions (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  branch_id INTEGER NOT NULL,
  table_id INTEGER NOT NULL REFERENCES tables_master(table_id),
  qr_token_id INTEGER NULL REFERENCES table_qr_tokens(id),

  customer_name VARCHAR(120),
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(120),

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL
);

-- One active session per (shop_id, table_id) identified by ended_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_table_qr_sessions_active
  ON table_qr_sessions (shop_id, table_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_table_qr_sessions_mobile
  ON table_qr_sessions (shop_id, mobile);

