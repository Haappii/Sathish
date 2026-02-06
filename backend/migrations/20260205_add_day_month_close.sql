-- Day close tables
CREATE TABLE IF NOT EXISTS branch_day_close (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branch(branch_id),
  close_date DATE NOT NULL,
  total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expense NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_by INTEGER NOT NULL REFERENCES users(user_id),
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_day_close (
  id SERIAL PRIMARY KEY,
  close_date DATE NOT NULL,
  total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expense NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_by INTEGER NOT NULL REFERENCES users(user_id),
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Month close tables
CREATE TABLE IF NOT EXISTS branch_month_close (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branch(branch_id),
  month_key VARCHAR(7) NOT NULL,
  month_start DATE NOT NULL,
  month_end DATE NOT NULL,
  total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expense NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_by INTEGER NOT NULL REFERENCES users(user_id),
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_month_close (
  id SERIAL PRIMARY KEY,
  month_key VARCHAR(7) NOT NULL,
  month_start DATE NOT NULL,
  month_end DATE NOT NULL,
  total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expense NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_by INTEGER NOT NULL REFERENCES users(user_id),
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- add app business date to shop_details
ALTER TABLE shop_details
  ADD COLUMN IF NOT EXISTS app_date DATE DEFAULT CURRENT_DATE;

-- add branch close flag
ALTER TABLE branch
  ADD COLUMN IF NOT EXISTS branch_close VARCHAR(1) DEFAULT 'N';
