# Mobile API Input/Output Checklist

Generated from mobile app code usage in src (static code analysis).

## Scope
- Unique endpoints: 66
- Total call sites: 104
- API clients: api (authenticated), authApi (login/logout)
- Authenticated headers: Authorization Bearer token, x-branch-id

## Auth

1. POST /auth/login
- Inputs: shop_id, username, password
- Outputs used: access_token or token, user_id, user_name or name, role_name, shop_id, branch_id, branch_name, branch_close, branch_type
- Call sites: src/context/AuthContext.js

2. POST /auth/logout
- Inputs: none
- Outputs used: success/no payload
- Call sites: src/context/AuthContext.js

## Billing and Invoices

3. POST /invoice/
- Inputs: invoice_number, customer_name, mobile, customer_id, items[], payment_mode, payment_split, service_charge
- Outputs used: invoice_number, kot_number, kot_token, order_id
- Call sites: src/screens/CreateBillScreen.js, src/offline/sync.js

4. GET /invoice/by-number/{invoiceNo}
- Inputs: path param invoiceNo
- Outputs used: invoice_number, customer_name, mobile, invoice_date, items, total_amount, payment_mode, customer_id
- Call sites: src/screens/CreateBillScreen.js, src/screens/SalesHistoryScreen.js, src/screens/ReturnsScreen.js, src/utils/printInvoice.js

5. GET /invoice/customer/by-mobile/{mobile}
- Inputs: path param mobile
- Outputs used: invoice list for mobile
- Call sites: src/screens/CreateBillScreen.js

6. GET /invoice/list
- Inputs: from_date, to_date, range, search, payment_mode
- Outputs used: invoice rows (invoice_number, customer_name, mobile, invoice_date, total_amount or grand_total, payment_mode)
- Call sites: src/screens/SalesHistoryScreen.js

7. POST /returns/
- Inputs: invoice_number, return_type, refund_mode, reason_code, reason, note, items[]
- Outputs used: success response
- Call sites: src/screens/ReturnsScreen.js

## Customers

8. GET /customers/
- Inputs: search (optional)
- Outputs used: customer list (customer_id, customer_name, mobile, email, address, wallet_balance, due_amount)
- Call sites: src/screens/CustomersScreen.js

9. GET /customers/{customer_id}
- Inputs: path param customer_id
- Outputs used: customer detail
- Call sites: src/screens/CustomersScreen.js

10. POST /customers/
- Inputs: customer_name, mobile, email, address
- Outputs used: created customer
- Call sites: src/screens/CustomersScreen.js

## Tables and Hotel Billing

11. GET /table-billing/tables
- Inputs: none
- Outputs used: tables list with table_id, table_name, section_name, status
- Call sites: src/screens/TableGridScreen.js, src/screens/TableOrderScreen.js

12. GET /table-billing/order/by-table/{table_id}
- Inputs: path param table_id
- Outputs used: current table order (order_id, items, status)
- Call sites: src/screens/TableOrderScreen.js

13. POST /table-billing/order/item/add
- Inputs: order_id, item_id, quantity
- Outputs used: updated order state
- Call sites: src/screens/TableOrderScreen.js

14. POST /table-billing/order/checkout/{orderId}
- Inputs: customer_name, mobile, payment_mode, payment_split, service_charge
- Outputs used: invoice_number, order_id, order_status
- Call sites: src/screens/CreateBillScreen.js, src/screens/HeldInvoicesScreen.js, src/screens/TableOrderScreen.js

15. POST /table-billing/takeaway
- Inputs: customer_name, mobile, notes, token_number, items[]
- Outputs used: order_id, token_number
- Call sites: src/screens/CreateBillScreen.js

16. GET /table-billing/takeaway/orders
- Inputs: none
- Outputs used: held takeaway orders (order_id, customer_name, mobile, items, token_number, status)
- Call sites: src/screens/HeldInvoicesScreen.js

17. POST /table-billing/order/transfer
- Inputs: source_order_id, dest_order_id
- Outputs used: success response
- Call sites: src/screens/TableOrderScreen.js

18. Cancel order endpoint family (retry variants)
- Inputs: order_id via path/query/body depending variant
- Outputs used: success response
- Variants used:
  - POST /table-billing/order/cancel/{orderId}
  - POST /table-billing/order/cancel/{orderId}/
  - POST /table-billing/order/cancel?order_id={orderId}
  - POST /table-billing/orders/{orderId}/cancel
  - PUT /table-billing/orders/{orderId}/cancel
  - PUT /table-billing/order/cancel?order_id={orderId}
  - DELETE /table-billing/order/cancel?order_id={orderId}
  - DELETE /table-billing/orders/{orderId}
  - POST /table-billing/order/cancel with body { order_id }
- Call sites: src/screens/HeldInvoicesScreen.js, src/screens/TableOrderScreen.js

## Kitchen (KOT)

19. GET /kot/order/{orderId}
- Inputs: path param orderId
- Outputs used: kot list with kot_id, kot_number, kot_token, status, items
- Call sites: src/screens/CreateBillScreen.js

20. POST /kot/create/{orderId}
- Inputs: path param orderId
- Outputs used: kot_number, kot_token, order_id
- Call sites: src/screens/CreateBillScreen.js, src/screens/TableOrderScreen.js

21. GET /kot/pending
- Inputs: none
- Outputs used: pending KOT rows
- Call sites: src/screens/KotManagementScreen.js

22. PUT /kot/{kotId}/status
- Inputs: status
- Outputs used: success response
- Call sites: src/screens/KotManagementScreen.js

23. GET /kot/tracking/orders
- Inputs: include_without_kot=false
- Outputs used: live order rows
- Call sites: src/screens/OrderLiveScreen.js

## Inventory and Stock

24. GET /category/
- Inputs: none
- Outputs used: category list
- Call sites: src/screens/CreateBillScreen.js, src/screens/InventoryScreen.js, src/screens/TableOrderScreen.js

25. GET /items/
- Inputs: none
- Outputs used: item list (item_id, item_name, category_id, selling_price or price, active flags)
- Call sites: src/screens/CreateBillScreen.js, src/screens/InventoryScreen.js, src/screens/TableOrderScreen.js

26. GET /inventory/list
- Inputs: branch_id
- Outputs used: stock list by item/branch
- Call sites: src/screens/InventoryScreen.js

27. POST /inventory/{mode}
- Inputs: item_id, qty, branch_id (query params)
- Outputs used: success response
- Call sites: src/screens/InventoryScreen.js

28. GET /parameters/inventory
- Inputs: none
- Outputs used: inventory parameters object
- Call sites: src/screens/InventoryScreen.js

## Finance: Dues and Cash Drawer

29. GET /dues/open
- Inputs: q/search (optional)
- Outputs used: due invoice rows (invoice_number, customer_name, mobile, pending_amount or due_amount)
- Call sites: src/screens/DuesScreen.js

30. POST /dues/pay
- Inputs: invoice_number, amount, payment_mode, reference_no
- Outputs used: success response
- Call sites: src/screens/DuesScreen.js

31. GET /cash-drawer/current
- Inputs: none
- Outputs used: current drawer state (status, opening_cash, cash sales totals, expected_closing, closing_cash)
- Call sites: src/screens/CashDrawerScreen.js

32. GET /cash-drawer/transactions
- Inputs: none
- Outputs used: transaction rows (id, type, description, amount, created_at)
- Call sites: src/screens/CashDrawerScreen.js

33. POST /cash-drawer/open
- Inputs: opening_cash
- Outputs used: open state response
- Call sites: src/screens/CashDrawerScreen.js

34. POST /cash-drawer/close
- Inputs: closing_cash
- Outputs used: close response including variance fields
- Call sites: src/screens/CashDrawerScreen.js

## Finance: Expenses

35. GET /expenses/
- Inputs: date_from, date_to
- Outputs used: expense rows (id, category, description, amount, expense_date)
- Call sites: src/screens/ExpensesScreen.js

36. POST /expenses/
- Inputs: category, description, amount, expense_date
- Outputs used: success response
- Call sites: src/screens/ExpensesScreen.js

## Day Close

37. GET /day-close/status
- Inputs: date_str
- Outputs used: branch closure rows (is_closed, closed_at, closed_by)
- Call sites: src/screens/DayCloseScreen.js

38. GET /day-close/summary
- Inputs: date_str, branch_id
- Outputs used: totals (sales, bills_count, tax, discount, expenses, variance)
- Call sites: src/screens/DayCloseScreen.js

39. POST /day-close/close
- Inputs: date_str, branch_id
- Outputs used: success response
- Call sites: src/screens/DayCloseScreen.js

## Employees and Attendance

40. GET /employees
- Inputs: status (optional)
- Outputs used: employees list (employee_id, employee_name, mobile, designation, wage_type, wages)
- Call sites: src/screens/EmployeesScreen.js, src/screens/EmployeeAttendanceScreen.js

41. POST /employees
- Inputs: employee_name, mobile, designation, wage_type, daily_wage, monthly_wage
- Outputs used: success response
- Call sites: src/screens/EmployeesScreen.js

42. GET /employees/attendance
- Inputs: date
- Outputs used: attendance rows (employee_id, status, worked_units)
- Call sites: src/screens/EmployeeAttendanceScreen.js

43. POST /employees/attendance/bulk
- Inputs: date, records[] with employee_id, date, status, worked_units, wage
- Outputs used: success response
- Call sites: src/screens/EmployeeAttendanceScreen.js

## Analytics and Reports

44. GET /dashboard/stats
- Inputs: date (optional)
- Outputs used: today_sales, today_bills, total_expenses, total_dues, top_items, recent_invoices
- Call sites: src/screens/DashboardScreen.js, src/screens/AnalyticsScreen.js

45. GET /analytics/summary
- Inputs: from_date, to_date
- Outputs used: sales totals, invoice count/bill_count, payment mode breakdown fields
- Call sites: src/screens/AnalyticsScreen.js

46. GET /analytics/top-items
- Inputs: from_date, to_date, limit
- Outputs used: item_id, item_name, quantity/total_qty, revenue/total_amount
- Call sites: src/screens/AnalyticsScreen.js

47. GET /reports/sales
- Inputs: start, end, payment_mode
- Outputs used: rows/invoices and summary aggregates
- Call sites: src/screens/ReportsScreen.js

## Loyalty

48. GET /loyalty/account/by-mobile/{mobile}
- Inputs: path param mobile
- Outputs used: customer_id, customer_name, points balance, tier
- Call sites: src/screens/LoyaltyScreen.js

49. GET /loyalty/transactions/{customer_id}
- Inputs: path param customer_id
- Outputs used: loyalty transaction rows
- Call sites: src/screens/LoyaltyScreen.js

50. POST /loyalty/adjust
- Inputs: customer_id, points, notes
- Outputs used: success response
- Call sites: src/screens/LoyaltyScreen.js

51. POST /loyalty/redeem
- Inputs: customer_id, points, notes
- Outputs used: success response
- Call sites: src/screens/LoyaltyScreen.js

## Suppliers and Ledger

52. GET /suppliers/
- Inputs: branch_id (admin optional)
- Outputs used: suppliers list (supplier_id, supplier_name, mobile, outstanding_balance)
- Call sites: src/screens/SupplierLedgerScreen.js

53. GET /supplier-ledger/aging
- Inputs: branch_id (admin optional)
- Outputs used: aging rows (supplier_id, supplier_name, total_due)
- Call sites: src/screens/SupplierLedgerScreen.js

54. GET /supplier-ledger/supplier/{supplierId}/open-pos
- Inputs: path supplierId, optional branch_id
- Outputs used: po_id, po_number, order_date, total_amount, due_amount
- Call sites: src/screens/SupplierLedgerScreen.js

55. GET /supplier-ledger/supplier/{supplierId}/statement
- Inputs: path supplierId, optional branch_id
- Outputs used: entry_id, entry_time, entry_type, debit, credit, notes
- Call sites: src/screens/SupplierLedgerScreen.js

56. POST /supplier-ledger/payment
- Inputs: supplier_id, branch_id, po_id, amount, payment_mode, reference_no, notes
- Outputs used: success response
- Call sites: src/screens/SupplierLedgerScreen.js

## Online and QR Orders

57. GET /online-orders/
- Inputs: provider, status, q
- Outputs used: orders list (id/order_id, provider, status, customer_name, mobile, items, total)
- Call sites: src/screens/OnlineOrdersScreen.js

58. PATCH /online-orders/{order_id}/status
- Inputs: status
- Outputs used: success response
- Call sites: src/screens/OnlineOrdersScreen.js

59. GET /qr-orders/pending
- Inputs: none
- Outputs used: pending QR orders list
- Call sites: src/screens/QrOrdersAcceptScreen.js

60. POST /qr-orders/{id}/accept
- Inputs: path param id
- Outputs used: order_id, status
- Call sites: src/screens/QrOrdersAcceptScreen.js

61. POST /qr-orders/{id}/reject
- Inputs: path param id
- Outputs used: success response
- Call sites: src/screens/QrOrdersAcceptScreen.js

## Shop, Branch, Permissions, Health

62. GET /shop/details
- Inputs: none
- Outputs used: shop_name, app_date, billing_type/shop_type, service_charge, receipt settings
- Call sites: src/screens/HomeScreen.js, src/screens/DashboardScreen.js, src/screens/CreateBillScreen.js, src/screens/ExpensesScreen.js, src/screens/SalesHistoryScreen.js, src/screens/InventoryScreen.js, src/screens/TableOrderScreen.js, src/screens/NativeModuleScreen.js

63. GET /branch/{branch_id}
- Inputs: path param branch_id
- Outputs used: branch_name, receipt_required, printer/network settings
- Call sites: src/screens/CreateBillScreen.js, src/screens/SalesHistoryScreen.js

64. GET /branch/active
- Inputs: none
- Outputs used: branch_id, branch_name, status
- Call sites: src/screens/SupplierLedgerScreen.js

65. GET /permissions/my
- Inputs: none
- Outputs used: enabled, modules[] with key, can_read, can_write
- Call sites: src/screens/HomeScreen.js, src/screens/NativeModuleScreen.js, src/screens/SupplierLedgerScreen.js

66. GET /health
- Inputs: none
- Outputs used: connectivity success/failure only
- Call sites: src/offline/sync.js

## Notes and Risks

- Some output shapes are inferred from accessed fields in UI code and may include backend-only fields not used by mobile.
- Cancel order uses multiple endpoint variants for compatibility in HeldInvoices flow.
- Static analysis only: no runtime API calls were executed in this checklist.
