-- Employee Management module

CREATE TABLE IF NOT EXISTS employees (
  employee_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  branch_id INTEGER NOT NULL REFERENCES branch(branch_id),
  employee_code VARCHAR(40) NULL,
  employee_name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NULL,
  designation VARCHAR(100) NULL,
  wage_type VARCHAR(20) NOT NULL DEFAULT 'DAILY',
  daily_wage FLOAT NOT NULL DEFAULT 0,
  monthly_wage FLOAT NOT NULL DEFAULT 0,
  join_date DATE NULL,
  notes VARCHAR(300) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_employees_shop_branch_active
  ON employees (shop_id, branch_id, active);
CREATE INDEX IF NOT EXISTS ix_employees_shop_name
  ON employees (shop_id, employee_name);

CREATE TABLE IF NOT EXISTS employee_attendance (
  attendance_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branch(branch_id),
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
  worked_units FLOAT NOT NULL DEFAULT 1,
  wage_amount FLOAT NOT NULL DEFAULT 0,
  notes VARCHAR(300) NULL,
  created_by INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_employee_attendance_shop_emp_date'
  ) THEN
    ALTER TABLE employee_attendance
      ADD CONSTRAINT uq_employee_attendance_shop_emp_date
      UNIQUE (shop_id, employee_id, attendance_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_employee_attendance_shop_date
  ON employee_attendance (shop_id, attendance_date);

CREATE TABLE IF NOT EXISTS employee_wage_payments (
  payment_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shop_details(shop_id),
  employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branch(branch_id),
  payment_date DATE NOT NULL,
  amount FLOAT NOT NULL DEFAULT 0,
  payment_mode VARCHAR(30) NOT NULL DEFAULT 'CASH',
  notes VARCHAR(300) NULL,
  created_by INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_employee_wage_payments_shop_date
  ON employee_wage_payments (shop_id, payment_date);
CREATE INDEX IF NOT EXISTS ix_employee_wage_payments_shop_emp
  ON employee_wage_payments (shop_id, employee_id);
