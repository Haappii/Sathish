-- Migration: Support decimal quantities in stock (for kg/g/ml/L raw materials)
-- Date: 2026-04-17

ALTER TABLE stock ALTER COLUMN quantity TYPE NUMERIC(12, 3) USING quantity::NUMERIC(12, 3);
ALTER TABLE stock_ledger ALTER COLUMN quantity TYPE NUMERIC(12, 3) USING quantity::NUMERIC(12, 3);
