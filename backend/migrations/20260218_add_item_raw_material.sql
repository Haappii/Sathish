-- Add a flag to separate raw materials (hotel inventory) from sellable menu items.
-- Default: FALSE (existing items remain sellable).

ALTER TABLE items
ADD COLUMN is_raw_material BOOLEAN NOT NULL DEFAULT FALSE;

