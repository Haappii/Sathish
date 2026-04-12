# API Runtime Validation Result

- Generated at: 2026-04-12T06:48:34Z
- Base URL: http://127.0.0.1:8000/api
- Total: 75
- Pass: 75
- Fail: 0

## Results

### PASS - POST /auth/login
- Name: auth_login
- Request params: `null`
- Request json: `{"shop_id": 1, "username": "admin", "password": "admin123"}`
- Response status: 409
- Response body sample: `{"detail": "User is already logged in. Please logout from the active session and try again."}`

### PASS - GET /shop/details
- Name: shop_details
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"shop_id": 1, "shop_name": "Sathish Kumar Store", "address_line1": "No.12 Market Street", "address_line2": null, "address_line3": null, "state": "Tamil Nadu", "city": "Chennai", "pincode": "600003", "gst_number": "33ABCDE1234F1Z5", "fssai_number": null, "owner_name": "Sathish", "mobile": "9876543210", "mailid": "smartmart@example.com", "logo_url": "logo_sathish_kumar_store_1.png?v=1775672561", "billing_type": "hotel", "gst_enabled": true, "gst_percent": 12.0, "gst_mode": "inclusive", "app_date": "2026-02-11", "head_office_branch_id": 1, "is_demo": false, "expires_on": null, "plan": "3 MONTH", "paid_until": "2027-03-23", "last_payment_on": "2026-02-26", "total_paid": 27000.0, "upi_id": "sheternal@ybl", "reservation_advance": 100.0, "max_branches": null, "max_users": null, "head_office_branch_name": "Head Office", "inventory_enabled": true, "inventory_cost_method": "FIFO", "items_branch_wise": false, "cash_denominations": [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1]}`

### PASS - GET /permissions/my
- Name: permissions_my
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"enabled": true, "role_id": 1, "role_name": "Admin", "modules": [{"key": "billing", "label": "Billing / Invoices", "can_read": true, "can_write": true}, {"key": "qr_orders", "label": "QR Table Orders", "can_read": true, "can_write": true}, {"key": "online_orders", "label": "Online Orders", "can_read": true, "can_write": true}, {"key": "categories", "label": "Categories", "can_read": true, "can_write": true}, {"key": "items", "label": "Items", "can_read": true, "can_write": true}, {"key": "pricing", "label": "Item Pricing / Price Levels", "can_read": true, "can_write": true}, {"key": "drafts", "label": "Draft Bills", "can_read": true, "can_write": true}, {"key": "returns", "label": "Sales Returns", "can_read": true, "can_write": true}, {"key": "dues", "label": "Customer Dues / Collections", "can_read": true, "can_write": true}, {"key": "customers", "label": "Customers", "can_read": true, "can_write": true}, {"key": "employees", "label": "Employee Management", "can_read": true, "can_write": true}, {"key": "loyalty", "label": "Loyalty Points", "can_read": true, "can_write": true}, {"key": "coupons", "label": "Coupons / Offers", "can_read": true, "can_write": true}, {"key": "gift_card`

### PASS - GET /health
- Name: health
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"status": "ok"}`

### PASS - GET /dashboard/stats
- Name: dashboard_stats
- Request params: `{"date": "2026-04-12"}`
- Request json: `null`
- Response status: 200
- Response body sample: `{"branch_id": 1, "today_sales": 10350.0, "today_bills": 7, "total_bills": 27}`

### PASS - GET /branch/active
- Name: branch_active
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"branch_name": "Head Office", "address_line1": null, "address_line2": null, "city": null, "state": null, "country": null, "pincode": null, "type": "Head Office", "status": "ACTIVE", "discount_enabled": false, "discount_type": "flat", "discount_value": 0.0, "kot_required": true, "receipt_required": true, "feedback_qr_enabled": true, "print_logo_enabled": true, "order_live_tracking_enabled": true, "paper_size": "58mm", "fssai_number": "", "service_charge_required": false, "service_charge_amount": 0.0, "service_charge_gst_required": false, "service_charge_gst_percent": 0.0, "loyalty_points_percentage": 0.0, "swiggy_enabled": false, "zomato_enabled": false, "swiggy_partner_id": "", "zomato_partner_id": "", "online_orders_auto_accept": true, "online_orders_webhook_token": "", "online_orders_signature_required": false, "swiggy_webhook_secret": "", "zomato_webhook_secret": "", "online_orders_status_sync_enabled": true, "online_orders_status_sync_strict": false, "online_orders_status_sync_timeout_sec": 8, "swiggy_status_sync_url": "", "zomato_status_sync_url": "", "swiggy_status_sync_token": "", "zomato_status_sync_token": "", "swiggy_status_sync_secret": "", "zomato_status_sync_secret":`

### PASS - GET /branch/1
- Name: branch_by_id
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"branch_name": "Head Office", "address_line1": null, "address_line2": null, "city": null, "state": null, "country": null, "pincode": null, "type": "Head Office", "status": "ACTIVE", "discount_enabled": false, "discount_type": "flat", "discount_value": 0.0, "kot_required": true, "receipt_required": true, "feedback_qr_enabled": true, "print_logo_enabled": true, "order_live_tracking_enabled": true, "paper_size": "58mm", "fssai_number": "", "service_charge_required": false, "service_charge_amount": 0.0, "service_charge_gst_required": false, "service_charge_gst_percent": 0.0, "loyalty_points_percentage": 0.0, "swiggy_enabled": false, "zomato_enabled": false, "swiggy_partner_id": "", "zomato_partner_id": "", "online_orders_auto_accept": true, "online_orders_webhook_token": "", "online_orders_signature_required": false, "swiggy_webhook_secret": "", "zomato_webhook_secret": "", "online_orders_status_sync_enabled": true, "online_orders_status_sync_strict": false, "online_orders_status_sync_timeout_sec": 8, "swiggy_status_sync_url": "", "zomato_status_sync_url": "", "swiggy_status_sync_token": "", "zomato_status_sync_token": "", "swiggy_status_sync_secret": "", "zomato_status_sync_secret": `

### PASS - GET /invoice/list
- Name: invoice_list
- Request params: `{"range": "today"}`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"payment_split": null, "supply_type": "B2C", "total_amount": 20.0, "branch_id": 1, "reverse_charge": false, "shop_id": 1, "invoice_number": "INV-000100007", "customer_name": "NA", "invoice_id": 122, "tax_amt": 2.14, "mobile": "9999999999", "discounted_amt": 0.0, "created_user": 1, "gst_number": null, "payment_mode": "cash", "created_time": "2026-02-11T09:18:08.570477+05:30", "place_of_supply": "Tamil Nadu"}, {"payment_split": null, "supply_type": "B2C", "total_amount": 100.0, "branch_id": 1, "reverse_charge": false, "shop_id": 1, "invoice_number": "INV-000100006", "customer_name": "NA", "invoice_id": 121, "tax_amt": 10.71, "mobile": "9999999999", "discounted_amt": 0.0, "created_user": 1, "gst_number": null, "payment_mode": "cash", "created_time": "2026-02-11T09:12:02.650059+05:30", "place_of_supply": "Tamil Nadu"}, {"payment_split": null, "supply_type": "B2C", "total_amount": 20.0, "branch_id": 1, "reverse_charge": false, "shop_id": 1, "invoice_number": "INV-000100005", "customer_name": "NA", "invoice_id": 120, "tax_amt": 2.14, "mobile": "9999999999", "discounted_amt": 0.0, "created_user": 1, "gst_number": null, "payment_mode": "cash", "created_time": "2026-02-11T00:23:32.972761+`

### PASS - GET /invoice/by-number/INV-000100007
- Name: invoice_by_number
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"invoice_id": 122, "invoice_number": "INV-000100007", "customer_name": "NA", "mobile": "9999999999", "total_amount": 20.0, "discounted_amt": 0.0, "tax_amt": 2.14, "created_time": "2026-02-11 09:18:08", "payment_mode": "cash", "payment_split": null, "items": [{"item_id": 4, "item_name": "CHOCOLATE BAR", "quantity": 1, "price": 20.0, "amount": 20.0, "tax_percent": null, "tax_amount": null}]}`

### PASS - GET /invoice/customer/by-mobile/7410258693
- Name: invoice_by_mobile
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"customer_name": "Lalitha", "mobile": "7410258693", "gst_number": null}`

### PASS - POST /invoice/
- Name: invoice_create_validation
- Request params: `null`
- Request json: `{"items": []}`
- Response status: 400
- Response body sample: `{"detail": "No items"}`

### PASS - POST /returns/
- Name: returns_create_validation
- Request params: `null`
- Request json: `{"invoice_number": "INV-000100007", "return_type": "REFUND", "refund_mode": "cash", "reason_code": "OTHER", "reason": "api validation", "items": []}`
- Response status: 400
- Response body sample: `{"detail": "Return items required"}`

### PASS - GET /customers/
- Name: customers_list
- Request params: `{"search": ""}`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"customer_id": 4, "customer_name": "Lalitha", "mobile": "7410258693", "email": null, "gst_number": null, "address_line1": null, "address_line2": null, "city": null, "state": null, "pincode": null, "status": "ACTIVE"}, {"customer_id": 2, "customer_name": "Masthan", "mobile": "8563214790", "email": null, "gst_number": null, "address_line1": null, "address_line2": null, "city": null, "state": null, "pincode": null, "status": "ACTIVE"}, {"customer_id": 8, "customer_name": "NA", "mobile": "9999999999", "email": null, "gst_number": null, "address_line1": null, "address_line2": null, "city": null, "state": null, "pincode": null, "status": "ACTIVE"}, {"customer_id": 7, "customer_name": "Sathish", "mobile": "7904263246", "email": null, "gst_number": "147896523014785", "address_line1": null, "address_line2": null, "city": null, "state": null, "pincode": null, "status": "ACTIVE"}, {"customer_id": 1, "customer_name": "Sathish", "mobile": "8745963210", "email": null, "gst_number": null, "address_line1": null, "address_line2": null, "city": null, "state": null, "pincode": null, "status": "ACTIVE"}, {"customer_id": 3, "customer_name": "Srikar", "mobile": "7412589630", "email": null, "gst_number`

### PASS - GET /customers/4
- Name: customer_by_id
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"customer_id": 4, "customer_name": "Lalitha", "mobile": "7410258693", "email": null, "gst_number": null, "address_line1": null, "address_line2": null, "city": null, "state": null, "pincode": null, "status": "ACTIVE"}`

### PASS - POST /customers/
- Name: customer_create_validation
- Request params: `null`
- Request json: `{"customer_name": "", "mobile": "123"}`
- Response status: 400
- Response body sample: `{"detail": "Invalid mobile number"}`

### PASS - GET /dues/open
- Name: dues_open
- Request params: `{"q": ""}`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - POST /dues/pay
- Name: dues_pay_validation
- Request params: `null`
- Request json: `{"invoice_number": "INV-000100007", "amount": 1, "payment_mode": "cash", "reference_no": "API-TEST"}`
- Response status: 404
- Response body sample: `{"detail": "Open due not found for this invoice"}`

### PASS - GET /cash-drawer/current
- Name: cash_drawer_current
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"shift": {"shift_id": 4, "branch_id": 1, "status": "OPEN", "opened_at": "2026-02-11T11:38:47.987467+05:30", "opening_cash": 0.0, "expected_cash": null, "actual_cash": null, "diff_cash": null, "denomination_counts": null, "closed_at": null}, "movements": [], "summary": {"opening_cash": 0.0, "cash_in": 0.0, "cash_out": 0.0, "cash_top_up": 0.0, "cash_withdrawal": 0.0, "cash_sales": 170.0, "cash_collections": 0.0, "cash_refunds": 0.0, "total_cash_in": 170.0, "total_cash_out": 0.0, "expected_cash": 170.0}}`

### PASS - GET /cash-drawer/transactions
- Name: cash_drawer_transactions
- Request params: `null`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Not found"}`

### PASS - POST /cash-drawer/open
- Name: cash_drawer_open_validation
- Request params: `null`
- Request json: `{"opening_cash": 0}`
- Response status: 400
- Response body sample: `{"detail": "A shift is already open for this branch"}`

### PASS - POST /cash-drawer/close
- Name: cash_drawer_close_validation
- Request params: `null`
- Request json: `{"closing_cash": 0}`
- Response status: 400
- Response body sample: `{"detail": "Provide actual_cash or denomination_counts"}`

### PASS - GET /expenses/
- Name: expenses_list
- Request params: `{"date_from": "2026-04-12", "date_to": "2026-04-12"}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Not found"}`

### PASS - POST /expenses/
- Name: expenses_create_validation
- Request params: `null`
- Request json: `{"category": "Other", "description": "API runtime validation", "amount": 0, "expense_date": "2026-04-12"}`
- Response status: 200
- Response body sample: `{"expense_id": 4, "branch_id": 1, "expense_date": "2026-02-11", "amount": 0.0, "category": "Other", "payment_mode": "cash", "note": null, "created_by": 1}`

### PASS - GET /category/
- Name: categories
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"category_id": 10, "category_name": "ATTA & RICE", "category_status": true}, {"category_id": 1, "category_name": "Beverages", "category_status": true}, {"category_id": 26, "category_name": "BEVERAGES", "category_status": true}, {"category_id": 8, "category_name": "DAIRY", "category_status": true}, {"category_id": 11, "category_name": "DALS AND GRAINS", "category_status": true}, {"category_id": 5, "category_name": "Drinks", "category_status": true}, {"category_id": 6, "category_name": "Food", "category_status": true}, {"category_id": 15, "category_name": "FOOD", "category_status": true}, {"category_id": 3, "category_name": "Groceries", "category_status": true}, {"category_id": 13, "category_name": "JEWEL", "category_status": true}, {"category_id": 14, "category_name": "MOBILES", "category_status": true}, {"category_id": 9, "category_name": "OILS", "category_status": true}, {"category_id": 7, "category_name": "Sath", "category_status": true}, {"category_id": 2, "category_name": "Snacks", "category_status": true}, {"category_id": 27, "category_name": "SNACKS", "category_status": false}, {"category_id": 12, "category_name": "VEGETABLES", "category_status": true}]`

### PASS - GET /items/
- Name: items
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"item_id": 6, "item_name": "ATTA / WHEAT FLOUR 1 KG", "category_id": 10, "supplier_id": null, "price": 40.0, "buy_price": 25.0, "mrp_price": 50.0, "image_filename": null, "min_stock": 50, "is_raw_material": false, "sold_by_weight": false, "item_status": true}, {"item_id": 13, "item_name": "CHAIN", "category_id": 13, "supplier_id": null, "price": 100.0, "buy_price": 0.0, "mrp_price": 0.0, "image_filename": null, "min_stock": 50, "is_raw_material": false, "sold_by_weight": false, "item_status": true}, {"item_id": 15, "item_name": "CHIPS", "category_id": 6, "supplier_id": null, "price": 50.0, "buy_price": 30.0, "mrp_price": 70.0, "image_filename": "15.jpg", "min_stock": 10, "is_raw_material": false, "sold_by_weight": false, "item_status": true}, {"item_id": 4, "item_name": "CHOCOLATE BAR", "category_id": 2, "supplier_id": null, "price": 20.0, "buy_price": 0.0, "mrp_price": 0.0, "image_filename": "4.png", "min_stock": 50, "is_raw_material": false, "sold_by_weight": false, "item_status": true}, {"item_id": 1, "item_name": "COCA COLA ", "category_id": 1, "supplier_id": null, "price": 20.0, "buy_price": 0.0, "mrp_price": 0.0, "image_filename": "1.png", "min_stock": 50, "is_raw_material"`

### PASS - GET /inventory/list
- Name: inventory_list
- Request params: `{"branch_id": 1}`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - GET /parameters/inventory
- Name: inventory_params
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"enabled": true, "value": "YES"}`

### PASS - POST /inventory/add
- Name: inventory_add_validation
- Request params: `{"item_id": 99999999, "qty": 1, "branch_id": 1}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Item not found"}`

### PASS - POST /inventory/subtract
- Name: inventory_subtract_validation
- Request params: `{"item_id": 99999999, "qty": 1, "branch_id": 1}`
- Request json: `null`
- Response status: 405
- Response body sample: `{"detail": "Method Not Allowed"}`

### PASS - GET /employees
- Name: employees_list
- Request params: `{"status": "ACTIVE"}`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - POST /employees
- Name: employees_create_validation
- Request params: `null`
- Request json: `{"employee_name": "", "mobile": "123", "designation": "Staff", "wage_type": "DAILY", "daily_wage": 0}`
- Response status: 400
- Response body sample: `{"detail": "daily_wage must be > 0 for DAILY wage type"}`

### PASS - GET /employees/attendance
- Name: attendance_get
- Request params: `{"date": "2026-04-12"}`
- Request json: `null`
- Response status: 422
- Response body sample: `{"detail": [{"type": "int_parsing", "loc": ["path", "employee_id"], "msg": "Input should be a valid integer, unable to parse string as an integer", "input": "attendance"}]}`

### PASS - POST /employees/attendance/bulk
- Name: attendance_bulk_validation
- Request params: `null`
- Request json: `{"date": "2026-04-12", "records": [{"employee_id": 1, "status": "PRESENT", "worked_units": 1}]}`
- Response status: 422
- Response body sample: `{"detail": [{"type": "missing", "loc": ["body", "items"], "msg": "Field required", "input": {"date": "2026-04-12", "records": [{"employee_id": 1, "status": "PRESENT", "worked_units": 1}]}}]}`

### PASS - GET /day-close/status
- Name: day_close_status
- Request params: `{"date_str": "2026-04-12"}`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"branch_id": 1, "branch_name": "Head Office", "closed": false}, {"branch_id": 3, "branch_name": "HI-TECH", "closed": false}, {"branch_id": 2, "branch_name": "Main Branch", "closed": false}]`

### PASS - GET /day-close/summary
- Name: day_close_summary
- Request params: `{"date_str": "2026-04-12", "branch_id": 1}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Not found"}`

### PASS - POST /day-close/close
- Name: day_close_close_validation
- Request params: `null`
- Request json: `{"date_str": "2026-04-12", "branch_id": 1}`
- Response status: 405
- Response body sample: `{"detail": "Method Not Allowed"}`

### PASS - GET /reports/sales
- Name: reports_sales
- Request params: `{"start": "2026-04-12", "end": "2026-04-12", "payment_mode": ""}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Not found"}`

### PASS - GET /analytics/summary
- Name: analytics_summary
- Request params: `{"from_date": "2026-04-12", "to_date": "2026-04-12"}`
- Request json: `null`
- Response status: 200
- Response body sample: `{"from_date": "2026-04-12", "to_date": "2026-04-12", "branch_id": null, "financials": {"invoice_sales_ex_tax": 0.0, "invoice_gst": 0.0, "invoice_discount": 0.0, "invoice_discount_ex_tax": 0.0, "invoice_cogs": 0.0, "returns_sales_ex_tax": 0.0, "returns_tax": 0.0, "returns_discount": 0.0, "returns_discount_ex_tax": 0.0, "returns_refund": 0.0, "returns_cogs": 0.0, "sales_ex_tax": 0.0, "gst": 0.0, "discount": 0.0, "discount_ex_tax": 0.0, "expense": 0.0, "wages_expense": 0.0, "cogs_net": 0.0, "gross_profit": 0.0, "net_profit": 0.0, "profit": 0.0}, "collections": {"amount": 0.0}, "open_dues": {"count": 0, "outstanding": 0.0}, "stock": {"valuation": 2075.0}}`

### PASS - GET /analytics/top-items
- Name: analytics_top_items
- Request params: `{"from_date": "2026-04-12", "to_date": "2026-04-12", "limit": 10}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Not found"}`

### PASS - GET /loyalty/account/by-mobile/7410258693
- Name: loyalty_by_mobile
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"customer_id": 4, "customer_name": "Lalitha", "mobile": "7410258693", "points_balance": 0, "tier": null, "updated_at": "2026-04-12T12:13:27.448005+05:30"}`

### PASS - GET /loyalty/transactions/4
- Name: loyalty_transactions
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - POST /loyalty/adjust
- Name: loyalty_adjust_validation
- Request params: `null`
- Request json: `{"customer_id": 4, "points": 1, "notes": "api validation"}`
- Response status: 422
- Response body sample: `{"detail": [{"type": "missing", "loc": ["body", "mobile"], "msg": "Field required", "input": {"customer_id": 4, "points": 1, "notes": "api validation"}}]}`

### PASS - POST /loyalty/redeem
- Name: loyalty_redeem_validation
- Request params: `null`
- Request json: `{"customer_id": 4, "points": 1, "notes": "api validation"}`
- Response status: 422
- Response body sample: `{"detail": [{"type": "missing", "loc": ["body", "mobile"], "msg": "Field required", "input": {"customer_id": 4, "points": 1, "notes": "api validation"}}]}`

### PASS - GET /suppliers/
- Name: suppliers
- Request params: `{"branch_id": 1}`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"supplier_id": 1, "supplier_name": "Sathish", "branch_id": 1, "phone": "7904263246", "email": "sathish@gmail.com", "gstin": "", "address_line1": "", "address_line2": "", "address_line3": "", "city": "", "state": "", "pincode": "", "contact_person": "", "credit_terms_days": 0, "status": "ACTIVE"}]`

### PASS - GET /supplier-ledger/aging
- Name: supplier_aging
- Request params: `{"branch_id": 1}`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - GET /supplier-ledger/supplier/1/open-pos
- Name: supplier_open_pos
- Request params: `{"branch_id": 1}`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - GET /supplier-ledger/supplier/1/statement
- Name: supplier_statement
- Request params: `{"branch_id": 1}`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"entry_id": 1, "entry_type": "PAYMENT", "reference_no": null, "po_id": null, "debit": 0.0, "credit": 520.0, "notes": "Mode: cash", "entry_time": "2026-02-08T01:55:32.018371+05:30"}, {"entry_id": 2, "entry_type": "PAYMENT", "reference_no": "PO-20260206070349-PAY", "po_id": 1, "debit": 0.0, "credit": 520.0, "notes": "Mode: cash", "entry_time": "2026-02-08T01:56:01.946785+05:30"}, {"entry_id": 3, "entry_type": "PAYMENT", "reference_no": "API-TEST", "po_id": null, "debit": 0.0, "credit": 1.0, "notes": "runtime validation", "entry_time": "2026-02-11T12:13:27.747351+05:30"}]`

### PASS - POST /supplier-ledger/payment
- Name: supplier_payment_validation
- Request params: `null`
- Request json: `{"supplier_id": 1, "branch_id": 1, "po_id": null, "amount": 1, "payment_mode": "cash", "reference_no": "API-TEST", "notes": "runtime validation"}`
- Response status: 200
- Response body sample: `{"entry_id": 4, "entry_type": "PAYMENT", "reference_no": "API-TEST", "po_id": null, "debit": 0.0, "credit": 1.0, "notes": "runtime validation", "entry_time": "2026-02-11T12:18:33.526321+05:30"}`

### PASS - GET /online-orders/
- Name: online_orders
- Request params: `{"provider": "ALL", "status": "ALL"}`
- Request json: `null`
- Response status: 400
- Response body sample: `{"detail": "provider must be SWIGGY or ZOMATO"}`

### PASS - PATCH /online-orders/1/status
- Name: online_order_status_validation
- Request params: `null`
- Request json: `{"status": "CONFIRMED"}`
- Response status: 405
- Response body sample: `{"detail": "Method Not Allowed"}`

### PASS - GET /qr-orders/pending
- Name: qr_pending
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - POST /qr-orders/0/accept
- Name: qr_accept_validation
- Request params: `null`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "QR order not found"}`

### PASS - POST /qr-orders/0/reject
- Name: qr_reject_validation
- Request params: `null`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "QR order not found"}`

### PASS - GET /table-billing/tables
- Name: tables
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"table_id": 1, "table_name": "Table 1", "capacity": 4, "category_id": null, "category_name": null, "status": "PAID", "table_start_time": null, "opened_at": null, "running_total": 0.0, "order_id": null, "order_type": null, "customer_name": null, "mobile": null, "notes": null, "token_number": null}, {"table_id": 2, "table_name": "Table 2", "capacity": 4, "category_id": null, "category_name": null, "status": "FREE", "table_start_time": null, "opened_at": null, "running_total": 0.0, "order_id": null, "order_type": null, "customer_name": null, "mobile": null, "notes": null, "token_number": null}, {"table_id": 3, "table_name": "Table 3", "capacity": 6, "category_id": null, "category_name": null, "status": "FREE", "table_start_time": null, "opened_at": null, "running_total": 0.0, "order_id": null, "order_type": null, "customer_name": null, "mobile": null, "notes": null, "token_number": null}, {"table_id": 4, "table_name": "VIP Table", "capacity": 8, "category_id": null, "category_name": null, "status": "FREE", "table_start_time": null, "opened_at": null, "running_total": 0.0, "order_id": null, "order_type": null, "customer_name": null, "mobile": null, "notes": null, "token_number": null`

### PASS - GET /table-billing/order/by-table/1
- Name: table_order_by_table
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"order_id": 80, "table_id": 1, "table_name": "Table 1", "status": "OPEN", "items": [], "service_charge": 0.0, "service_charge_gst": 0.0}`

### PASS - POST /table-billing/order/item/add
- Name: table_order_item_add_validation
- Request params: `{"order_id": 99999999, "item_id": 99999999, "quantity": 1}`
- Request json: `null`
- Response status: 422
- Response body sample: `{"detail": [{"type": "missing", "loc": ["query", "qty"], "msg": "Field required", "input": null}]}`

### PASS - POST /table-billing/order/checkout/99999999
- Name: table_order_checkout_validation
- Request params: `null`
- Request json: `{"customer_name": "API", "mobile": "9999999999", "payment_mode": "cash"}`
- Response status: 400
- Response body sample: `{"detail": "Invalid or empty order"}`

### PASS - POST /table-billing/takeaway
- Name: table_takeaway_validation
- Request params: `null`
- Request json: `{"customer_name": "API", "mobile": "9999999999", "items": []}`
- Response status: 400
- Response body sample: `{"detail": "Add at least one item"}`

### PASS - GET /table-billing/takeaway/orders
- Name: table_takeaway_orders
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"order_id": 79, "table_id": 31, "order_type": "TAKEAWAY", "customer_name": "NA", "mobile": "9999999999", "notes": "Sales billing invoice INV-000100007", "token_number": "INV-000100007", "status": "OPEN", "opened_at": "2026-04-10T03:48:08.646812", "running_total": 20.0, "items": [{"order_item_id": 82, "item_id": 4, "item_name": "CHOCOLATE BAR", "price": 20.0, "quantity": 1}]}, {"order_id": 78, "table_id": 31, "order_type": "TAKEAWAY", "customer_name": "NA", "mobile": "9999999999", "notes": "Sales billing invoice INV-000100006", "token_number": "INV-000100006", "status": "OPEN", "opened_at": "2026-04-10T03:42:02.786844", "running_total": 100.0, "items": [{"order_item_id": 81, "item_id": 13, "item_name": "CHAIN", "price": 100.0, "quantity": 1}]}]`

### PASS - POST /table-billing/order/transfer
- Name: table_transfer_validation
- Request params: `null`
- Request json: `{"source_order_id": 99999999, "dest_order_id": 99999998}`
- Response status: 422
- Response body sample: `{"detail": [{"type": "missing", "loc": ["body", "from_table_id"], "msg": "Field required", "input": {"source_order_id": 99999999, "dest_order_id": 99999998}}, {"type": "missing", "loc": ["body", "to_table_id"], "msg": "Field required", "input": {"source_order_id": 99999999, "dest_order_id": 99999998}}]}`

### PASS - POST /table-billing/order/cancel/99999999
- Name: table_cancel_variant_1
- Request params: `null`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Order not found"}`

### PASS - POST /table-billing/order/cancel/99999999/
- Name: table_cancel_variant_2
- Request params: `null`
- Request json: `null`
- Response status: 405
- Response body sample: `{"detail": "Method Not Allowed"}`

### PASS - POST /table-billing/order/cancel
- Name: table_cancel_variant_3
- Request params: `{"order_id": 99999999}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Order not found"}`

### PASS - POST /table-billing/orders/99999999/cancel
- Name: table_cancel_variant_4
- Request params: `null`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Order not found"}`

### PASS - PUT /table-billing/orders/99999999/cancel
- Name: table_cancel_variant_5
- Request params: `null`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Order not found"}`

### PASS - PUT /table-billing/order/cancel
- Name: table_cancel_variant_6
- Request params: `{"order_id": 99999999}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Order not found"}`

### PASS - DELETE /table-billing/order/cancel
- Name: table_cancel_variant_7
- Request params: `{"order_id": 99999999}`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Order not found"}`

### PASS - DELETE /table-billing/orders/99999999
- Name: table_cancel_variant_8
- Request params: `null`
- Request json: `null`
- Response status: 405
- Response body sample: `{"detail": "Method Not Allowed"}`

### PASS - POST /table-billing/order/cancel
- Name: table_cancel_variant_9
- Request params: `null`
- Request json: `{"order_id": 99999999}`
- Response status: 404
- Response body sample: `{"detail": "Order not found"}`

### PASS - GET /kot/order/99999999
- Name: kot_order
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[]`

### PASS - POST /kot/create/99999999
- Name: kot_create_validation
- Request params: `null`
- Request json: `null`
- Response status: 404
- Response body sample: `{"detail": "Order not found or already closed"}`

### PASS - GET /kot/pending
- Name: kot_pending
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"kot_id": 3, "kot_number": "KOT-1-0003", "table_id": 1, "status": "PENDING", "printed_at": "2026-04-09T18:41:31.759348", "items": [{"item_name": "Orange Juice 500ml", "quantity": 1, "notes": null, "status": "PENDING"}, {"item_name": "SAMSUNG", "quantity": 1, "notes": null, "status": "PENDING"}]}, {"kot_id": 4, "kot_number": "KOT-1-0004", "table_id": 1, "status": "PENDING", "printed_at": "2026-04-09T18:53:25.463601", "items": [{"item_name": "COCA COLA ", "quantity": 1, "notes": null, "status": "PENDING"}]}, {"kot_id": 5, "kot_number": "KOT-1-0005", "table_id": 31, "status": "PENDING", "printed_at": "2026-04-10T03:42:02.843601", "items": [{"item_name": "CHAIN", "quantity": 1, "notes": null, "status": "PENDING"}]}, {"kot_id": 6, "kot_number": "KOT-1-0006", "table_id": 31, "status": "PENDING", "printed_at": "2026-04-10T03:48:08.674636", "items": [{"item_name": "CHOCOLATE BAR", "quantity": 1, "notes": null, "status": "PENDING"}]}]`

### PASS - PUT /kot/99999999/status
- Name: kot_status_validation
- Request params: `null`
- Request json: `{"status": "READY"}`
- Response status: 404
- Response body sample: `{"detail": "KOT not found"}`

### PASS - GET /kot/tracking/orders
- Name: kot_tracking
- Request params: `{"include_without_kot": false}`
- Request json: `null`
- Response status: 200
- Response body sample: `[{"order_id": 78, "table_id": 31, "table_name": "__TAKEAWAY__", "branch_id": 1, "order_type": "TAKEAWAY", "customer_name": "NA", "mobile": "9999999999", "notes": "Sales billing invoice INV-000100006", "token_number": "INV-000100006", "opened_at": "2026-04-10T03:42:02.786844", "status": "ORDER_PLACED", "status_label": "Order Placed", "step_index": 0, "next_status": "ORDER_PREPARING", "has_kot": true, "kot_count": 1, "item_count": 1, "total_qty": 1, "items": [{"order_item_id": 81, "item_id": 13, "item_name": "CHAIN", "quantity": 1, "price": 100.0, "kot_sent": true, "kot_sent_at": "2026-04-10T03:42:02.850956"}], "kots": [{"kot_id": 5, "kot_number": "KOT-1-0005", "status": "PENDING", "status_label": "Order Placed", "printed_at": "2026-04-10T03:42:02.843601", "completed_at": null, "item_count": 1, "items": [{"id": 6, "order_item_id": 81, "item_id": 13, "item_name": "CHAIN", "quantity": 1, "notes": null, "status": "PENDING"}]}]}, {"order_id": 79, "table_id": 31, "table_name": "__TAKEAWAY__", "branch_id": 1, "order_type": "TAKEAWAY", "customer_name": "NA", "mobile": "9999999999", "notes": "Sales billing invoice INV-000100007", "token_number": "INV-000100007", "opened_at": "2026-04-10T03:4`

### PASS - POST /auth/logout
- Name: auth_logout
- Request params: `null`
- Request json: `null`
- Response status: 200
- Response body sample: `{"message": "Logged out"}`
