-- Branch daily expenses
CREATE TABLE IF NOT EXISTS branch_expenses (
  expense_id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branch(branch_id),
  expense_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  category VARCHAR(120) NOT NULL,
  payment_mode VARCHAR(30) NOT NULL DEFAULT 'cash',
  note VARCHAR(300),
  created_by INTEGER NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
