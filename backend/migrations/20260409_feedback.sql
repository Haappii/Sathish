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
CREATE INDEX IF NOT EXISTS idx_feedback_shop_id ON feedback(shop_id);

GRANT ALL PRIVILEGES ON TABLE feedback TO shopuser;
GRANT USAGE, SELECT ON SEQUENCE feedback_feedback_id_seq TO shopuser;
