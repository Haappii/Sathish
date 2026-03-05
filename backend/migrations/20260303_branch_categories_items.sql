-- Add optional branch ownership on categories and items (branch-scoped ops, shop remains owner)

ALTER TABLE category
    ADD COLUMN IF NOT EXISTS branch_id INTEGER NULL REFERENCES branch(branch_id);

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS branch_id INTEGER NULL REFERENCES branch(branch_id);

-- (Optional) Seed existing categories/items with NULL to keep them shop-shared.
