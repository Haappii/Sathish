BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS onboard_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMP WITH TIME ZONE NULL,
  used_shop_id INTEGER NULL REFERENCES shop_details(shop_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM onboard_codes) THEN
    INSERT INTO onboard_codes (code)
    SELECT upper(replace(gen_random_uuid()::text, '-', ''))
    FROM generate_series(1, 100) AS g;
  END IF;
END $$;

COMMIT;
