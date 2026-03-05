-- Branch-wise item pricing / availability

CREATE TABLE IF NOT EXISTS branch_item_price (
    price_id     SERIAL PRIMARY KEY,
    shop_id      INTEGER NOT NULL REFERENCES shop_details(shop_id) ON DELETE CASCADE,
    branch_id    INTEGER NOT NULL REFERENCES branch(branch_id) ON DELETE CASCADE,
    item_id      INTEGER NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    price        NUMERIC(12,2) NOT NULL DEFAULT 0,
    buy_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
    mrp_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
    item_status  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (shop_id, branch_id, item_id)
);

-- Seed per-branch records from existing item prices
INSERT INTO branch_item_price (shop_id, branch_id, item_id, price, buy_price, mrp_price, item_status)
SELECT i.shop_id, b.branch_id, i.item_id, i.price, i.buy_price, i.mrp_price, i.item_status
FROM items i
JOIN branch b ON b.shop_id = i.shop_id
ON CONFLICT DO NOTHING;
