-- Migration: Add unit field for raw material stock tracking
-- Date: 2026-04-16

ALTER TABLE items ADD COLUMN IF NOT EXISTS unit VARCHAR(20);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit VARCHAR(20);

-- Useful index hint for future lookups by unit (optional)
-- CREATE INDEX IF NOT EXISTS ix_items_unit ON items(unit) WHERE unit IS NOT NULL;
