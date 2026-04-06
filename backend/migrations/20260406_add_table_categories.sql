-- Create table_categories table
CREATE TABLE IF NOT EXISTS table_categories (
    category_id SERIAL PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
    category_name VARCHAR(100) NOT NULL,
    branch_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on shop_id and branch_id for faster queries
CREATE INDEX IF NOT EXISTS idx_table_categories_shop_branch ON table_categories(shop_id, branch_id);

-- Add category_id column to tables_master if it doesn't exist
ALTER TABLE tables_master ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES table_categories(category_id);

-- Create index on category_id for faster joins
CREATE INDEX IF NOT EXISTS idx_tables_master_category_id ON tables_master(category_id);
