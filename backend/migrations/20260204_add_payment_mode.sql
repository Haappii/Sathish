-- Add payment fields to invoice table (PostgreSQL)
ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) DEFAULT 'cash';

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS payment_split JSONB;

-- Optional: backfill existing rows to a default
UPDATE invoice
SET payment_mode = 'cash'
WHERE payment_mode IS NULL;
