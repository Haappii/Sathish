CREATE TABLE IF NOT EXISTS date_wise_stock (
  id SERIAL PRIMARY KEY,
  stock_date DATE NOT NULL,
  item_id INTEGER NOT NULL REFERENCES items(item_id),
  branch_id INTEGER NOT NULL REFERENCES branch(branch_id),
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_date_wise_stock_date_branch
  ON date_wise_stock (stock_date, branch_id);
