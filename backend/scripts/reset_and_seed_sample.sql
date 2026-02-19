-- Postgres reset + seed sample data for Shop Billing App
--
-- What it does:
-- 1) Deletes ALL data from ALL tables in the `public` schema (TRUNCATE ... CASCADE)
-- 2) Inserts minimal sample data for:
--    - one STORE shop (billing_type=store)
--    - one HOTEL shop (billing_type=hotel)
--
-- Safe usage:
-- - Run only in a dev/test database.
-- - This is destructive and irreversible.
--
-- Run (psql):
--   psql "postgresql://user:pass@host:5432/db" -v ON_ERROR_STOP=1 -f reset_and_seed_sample.sql

BEGIN;

DO $$
DECLARE
  r record;
  v_admin_role_id int;
  v_manager_role_id int;

  v_store_shop_id int;
  v_store_branch_id int;
  v_store_admin_user_id int;
  v_store_manager_user_id int;
  v_store_cat_id int;
  v_store_item_id int;
  v_store_emp_id int;
  v_store_invoice_id int;

  v_hotel_shop_id int;
  v_hotel_branch_id int;
  v_hotel_admin_user_id int;
  v_hotel_manager_user_id int;
  v_hotel_cat_raw_id int;
  v_hotel_cat_menu_id int;
  v_hotel_raw_rice_item_id int;
  v_hotel_raw_oil_item_id int;
  v_hotel_menu_item_id int;
  v_hotel_emp_id int;
  v_hotel_invoice_id int;
BEGIN
  -- ------------------------------------------------------------
  -- 1) DELETE ALL DATA (ALL TABLES)
  -- ------------------------------------------------------------
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', 'public', r.tablename);
  END LOOP;

  -- ------------------------------------------------------------
  -- 2) CORE ROLES
  -- ------------------------------------------------------------
  INSERT INTO roles (role_name, status)
  VALUES ('Admin', TRUE)
  RETURNING role_id INTO v_admin_role_id;

  INSERT INTO roles (role_name, status)
  VALUES ('Manager', TRUE)
  RETURNING role_id INTO v_manager_role_id;

  -- ------------------------------------------------------------
  -- 3) SAMPLE STORE (billing_type=store)
  -- ------------------------------------------------------------
  INSERT INTO shop_details (
    shop_name, billing_type, gst_enabled, gst_percent, gst_mode, app_date
  )
  VALUES (
    'Sample Store', 'store', TRUE, 5.00, 'inclusive', CURRENT_DATE
  )
  RETURNING shop_id INTO v_store_shop_id;

  INSERT INTO system_parameters (shop_id, param_key, param_value)
  VALUES (v_store_shop_id, 'inventory_enabled', 'YES');

  INSERT INTO branch (
    shop_id, branch_name, city, state, country, pincode, type, status, branch_close
  )
  VALUES (
    v_store_shop_id, 'Head Office', 'Sample City', 'Sample State', 'Sample Country', '000000',
    'Head Office', 'ACTIVE', 'N'
  )
  RETURNING branch_id INTO v_store_branch_id;

  -- NOTE: passwords stored as plain-text (login will upgrade them to bcrypt after first login)
  INSERT INTO users (
    shop_id, user_name, password, name, role, status, login_status, branch_id
  )
  VALUES (
    v_store_shop_id, 'admin', 'admin123', 'Store Admin', v_admin_role_id, TRUE, FALSE, v_store_branch_id
  )
  RETURNING user_id INTO v_store_admin_user_id;

  INSERT INTO users (
    shop_id, user_name, password, name, role, status, login_status, branch_id
  )
  VALUES (
    v_store_shop_id, 'manager', 'manager123', 'Store Manager', v_manager_role_id, TRUE, FALSE, v_store_branch_id
  )
  RETURNING user_id INTO v_store_manager_user_id;

  INSERT INTO category (shop_id, category_name, category_status)
  VALUES (v_store_shop_id, 'Grocery', TRUE)
  RETURNING category_id INTO v_store_cat_id;

  INSERT INTO items (
    shop_id, category_id, item_name, price, buy_price, mrp_price, min_stock, is_raw_material, item_status
  )
  VALUES (
    v_store_shop_id, v_store_cat_id, 'RICE 1KG', 60, 45, 65, 10, FALSE, TRUE
  )
  RETURNING item_id INTO v_store_item_id;

  INSERT INTO stock (shop_id, item_id, branch_id, quantity, min_stock)
  VALUES (v_store_shop_id, v_store_item_id, v_store_branch_id, 25, 10);

  -- Wages sample (attendance = expense)
  INSERT INTO employees (
    shop_id, branch_id, employee_code, employee_name, mobile, designation, wage_type, daily_wage, monthly_wage, active, created_by
  )
  VALUES (
    v_store_shop_id, v_store_branch_id, 'E001', 'Sample Employee', '9999999999', 'Staff',
    'DAILY', 500, 0, TRUE, v_store_admin_user_id
  )
  RETURNING employee_id INTO v_store_emp_id;

  INSERT INTO employee_attendance (
    shop_id, employee_id, branch_id, attendance_date, status, worked_units, wage_amount, notes, created_by
  )
  VALUES (
    v_store_shop_id, v_store_emp_id, v_store_branch_id, CURRENT_DATE, 'PRESENT', 1, 500, 'Sample attendance wage', v_store_admin_user_id
  );

  -- Expense sample
  INSERT INTO branch_expenses (
    shop_id, branch_id, expense_date, amount, category, payment_mode, note, created_by
  )
  VALUES (
    v_store_shop_id, v_store_branch_id, CURRENT_DATE, 250.00, 'Misc', 'cash', 'Sample expense', v_store_admin_user_id
  );

  -- Invoice sample
  INSERT INTO invoice (
    shop_id, invoice_number, total_amount, tax_amt, discounted_amt, payment_mode, branch_id, created_user, customer_name
  )
  VALUES (
    v_store_shop_id, 'STORE-INV-0001', 105.00, 5.00, 0.00, 'cash', v_store_branch_id, v_store_admin_user_id, 'Walk-in'
  )
  RETURNING invoice_id INTO v_store_invoice_id;

  INSERT INTO invoice_details (
    shop_id, invoice_id, item_id, branch_id, quantity, amount, buy_price, mrp_price
  )
  VALUES (
    v_store_shop_id, v_store_invoice_id, v_store_item_id, v_store_branch_id, 2, 100.00, 45, 65
  );

  -- ------------------------------------------------------------
  -- 4) SAMPLE HOTEL (billing_type=hotel)
  -- ------------------------------------------------------------
  INSERT INTO shop_details (
    shop_name, billing_type, gst_enabled, gst_percent, gst_mode, app_date
  )
  VALUES (
    'Sample Hotel', 'hotel', TRUE, 5.00, 'inclusive', CURRENT_DATE
  )
  RETURNING shop_id INTO v_hotel_shop_id;

  INSERT INTO system_parameters (shop_id, param_key, param_value)
  VALUES (v_hotel_shop_id, 'inventory_enabled', 'YES');

  INSERT INTO branch (
    shop_id, branch_name, city, state, country, pincode, type, status, branch_close
  )
  VALUES (
    v_hotel_shop_id, 'Head Office', 'Sample City', 'Sample State', 'Sample Country', '000000',
    'Head Office', 'ACTIVE', 'N'
  )
  RETURNING branch_id INTO v_hotel_branch_id;

  INSERT INTO users (
    shop_id, user_name, password, name, role, status, login_status, branch_id
  )
  VALUES (
    v_hotel_shop_id, 'admin', 'admin123', 'Hotel Admin', v_admin_role_id, TRUE, FALSE, v_hotel_branch_id
  )
  RETURNING user_id INTO v_hotel_admin_user_id;

  INSERT INTO users (
    shop_id, user_name, password, name, role, status, login_status, branch_id
  )
  VALUES (
    v_hotel_shop_id, 'manager', 'manager123', 'Hotel Manager', v_manager_role_id, TRUE, FALSE, v_hotel_branch_id
  )
  RETURNING user_id INTO v_hotel_manager_user_id;

  INSERT INTO category (shop_id, category_name, category_status)
  VALUES (v_hotel_shop_id, 'Raw Materials', TRUE)
  RETURNING category_id INTO v_hotel_cat_raw_id;

  INSERT INTO category (shop_id, category_name, category_status)
  VALUES (v_hotel_shop_id, 'Menu', TRUE)
  RETURNING category_id INTO v_hotel_cat_menu_id;

  -- Raw materials (inventory is for raw materials only in hotels)
  INSERT INTO items (
    shop_id, category_id, item_name, price, buy_price, mrp_price, min_stock, is_raw_material, item_status
  )
  VALUES (
    v_hotel_shop_id, v_hotel_cat_raw_id, 'RICE (RAW)', 0, 0, 0, 5, TRUE, TRUE
  )
  RETURNING item_id INTO v_hotel_raw_rice_item_id;

  INSERT INTO items (
    shop_id, category_id, item_name, price, buy_price, mrp_price, min_stock, is_raw_material, item_status
  )
  VALUES (
    v_hotel_shop_id, v_hotel_cat_raw_id, 'OIL (RAW)', 0, 0, 0, 2, TRUE, TRUE
  )
  RETURNING item_id INTO v_hotel_raw_oil_item_id;

  -- Sellable menu item (hotels only need selling price)
  INSERT INTO items (
    shop_id, category_id, item_name, price, buy_price, mrp_price, min_stock, is_raw_material, item_status
  )
  VALUES (
    v_hotel_shop_id, v_hotel_cat_menu_id, 'VEG FRIED RICE', 120, 0, 0, 0, FALSE, TRUE
  )
  RETURNING item_id INTO v_hotel_menu_item_id;

  INSERT INTO stock (shop_id, item_id, branch_id, quantity, min_stock)
  VALUES (v_hotel_shop_id, v_hotel_raw_rice_item_id, v_hotel_branch_id, 20, 5);

  INSERT INTO stock (shop_id, item_id, branch_id, quantity, min_stock)
  VALUES (v_hotel_shop_id, v_hotel_raw_oil_item_id, v_hotel_branch_id, 10, 2);

  -- Wages sample (attendance = expense)
  INSERT INTO employees (
    shop_id, branch_id, employee_code, employee_name, mobile, designation, wage_type, daily_wage, monthly_wage, active, created_by
  )
  VALUES (
    v_hotel_shop_id, v_hotel_branch_id, 'E001', 'Sample Employee', '9999999999', 'Staff',
    'DAILY', 500, 0, TRUE, v_hotel_admin_user_id
  )
  RETURNING employee_id INTO v_hotel_emp_id;

  INSERT INTO employee_attendance (
    shop_id, employee_id, branch_id, attendance_date, status, worked_units, wage_amount, notes, created_by
  )
  VALUES (
    v_hotel_shop_id, v_hotel_emp_id, v_hotel_branch_id, CURRENT_DATE, 'PRESENT', 1, 500, 'Sample attendance wage', v_hotel_admin_user_id
  );

  -- Expense sample
  INSERT INTO branch_expenses (
    shop_id, branch_id, expense_date, amount, category, payment_mode, note, created_by
  )
  VALUES (
    v_hotel_shop_id, v_hotel_branch_id, CURRENT_DATE, 300.00, 'Gas', 'cash', 'Sample hotel expense', v_hotel_admin_user_id
  );

  -- Invoice sample
  INSERT INTO invoice (
    shop_id, invoice_number, total_amount, tax_amt, discounted_amt, payment_mode, branch_id, created_user, customer_name
  )
  VALUES (
    v_hotel_shop_id, 'HOTEL-INV-0001', 126.00, 6.00, 0.00, 'cash', v_hotel_branch_id, v_hotel_admin_user_id, 'Walk-in'
  )
  RETURNING invoice_id INTO v_hotel_invoice_id;

  INSERT INTO invoice_details (
    shop_id, invoice_id, item_id, branch_id, quantity, amount, buy_price, mrp_price
  )
  VALUES (
    v_hotel_shop_id, v_hotel_invoice_id, v_hotel_menu_item_id, v_hotel_branch_id, 2, 120.00, 0, 0
  );

END $$;

COMMIT;

