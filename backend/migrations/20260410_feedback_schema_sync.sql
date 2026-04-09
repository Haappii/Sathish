CREATE TABLE IF NOT EXISTS feedback (
    feedback_id   SERIAL PRIMARY KEY,
    shop_id       INTEGER NOT NULL REFERENCES shop_details(shop_id),
    invoice_no    VARCHAR(60),
    customer_name VARCHAR(120),
    mobile        VARCHAR(20),
    rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment       TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS feedback
  ADD COLUMN IF NOT EXISTS shop_id INTEGER,
  ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(60),
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS mobile VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rating INTEGER,
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE feedback
SET created_at = NOW()
WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_shop_id ON feedback(shop_id);

DO $$
BEGIN
  IF to_regclass('public.feedback_feedback_id_seq') IS NULL THEN
    CREATE SEQUENCE feedback_feedback_id_seq;
  END IF;

  BEGIN
    ALTER TABLE feedback
      ALTER COLUMN feedback_id SET DEFAULT nextval('feedback_feedback_id_seq');
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feedback'
      AND column_name = 'feedback_id'
  ) THEN
    PERFORM setval(
      'feedback_feedback_id_seq',
      COALESCE((SELECT MAX(feedback_id) FROM feedback), 0) + 1,
      false
    );
  END IF;
END $$;
