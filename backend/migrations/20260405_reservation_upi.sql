-- Migration: Add UPI payment fields for reservations
-- Date: 2026-04-05

-- UPI ID and default advance amount on shop
ALTER TABLE shop_details
    ADD COLUMN IF NOT EXISTS upi_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS reservation_advance NUMERIC(10, 2) DEFAULT 0;

-- Advance amount stored per reservation
ALTER TABLE table_reservations
    ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(10, 2) DEFAULT 0;
