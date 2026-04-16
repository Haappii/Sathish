-- Migration: Add branch-level UPI payment IDs
-- Each branch can have up to 4 UPI IDs.
-- QR codes are generated for every non-null UPI ID at billing time.

ALTER TABLE branch
    ADD COLUMN IF NOT EXISTS upi_id   VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS upi_id_2 VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS upi_id_3 VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS upi_id_4 VARCHAR(80) DEFAULT NULL;
