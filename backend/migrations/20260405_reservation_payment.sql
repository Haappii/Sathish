-- Migration: Add payment_token and payment_status to table_reservations
-- Date: 2026-04-05

ALTER TABLE table_reservations
    ADD COLUMN IF NOT EXISTS payment_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID';

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_table_reservations_payment_token
    ON table_reservations (payment_token);
