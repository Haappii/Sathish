# ShopApp User Manual

## 1. Purpose
This manual explains how to use the ShopApp menus and navigation in a clear, practical way for daily operations.

## 2. Login and Starting Point
1. Open the application and login with your credentials.
2. You will land on `Home` (`/home`).
3. Use the left sidebar as the main navigation area.
4. Menu visibility depends on your role (Admin, Manager, Cashier, Waiter) and permissions.

## 3. Navigation Basics
1. `Home` is the central dashboard.
2. Sidebar contains feature menus.
3. Use `Back` buttons inside screens to return quickly.
4. Use `Logout` from header/sidebar to end session safely.

## 4. Main Menu Guide

| Menu | Route | What it is used for |
|---|---|---|
| Home | `/home` | Dashboard, quick access, high-level business view |
| Billing / Take Away | `/sales/create` | Create new sales bill |
| Billing History | `/sales/history` | Find, review, and edit previous bills |
| Inventory / Raw Materials | `/inventory` | Track stock quantities and availability |
| Customers | `/customers` | Customer profile and outstanding dues |
| Dues | `/dues` | Pending payment management |
| Returns | `/returns` | Handle sales return operations |
| Expenses | `/expenses` | Record and monitor business expenses |
| Reports | `/reports` | Financial and operational reports |
| Admin / Setup | `/setup` | Configure shop, users, branches, permissions, items |

## 5. Sales Workflow
1. Go to `Billing` (`/sales/create`).
2. Select items and adjust quantity.
3. Add customer details if needed.
4. Save/print the invoice.
5. Use `Billing History` to verify completed invoices.

## 6. Inventory Workflow
1. Open `Inventory`.
2. Review available stock and low-stock items.
3. Use `Stock Transfers` (`/stock-transfers`) when moving stock between branches.
4. Use `Stock Audit` (`/stock-audit`) for correction and verification.

## 7. Setup and Administration
Open `Admin` (`/setup`) for configuration pages.

Common setup pages:
1. Categories: `/setup/categories`
2. Items: `/setup/items`
3. Shop Details: `/setup/shop`
4. Users: `/setup/users`
5. Branches: `/setup/branches`
6. Suppliers: `/setup/suppliers`
7. Purchase Orders: `/setup/purchase-orders`
8. Permissions: `/setup/permissions`
9. Excel Upload: `/setup/excel-upload`
10. Mail Scheduler: `/setup/mail-scheduler`

## 8. Hotel/Restaurant Mode Menus (if enabled)
1. Table Billing: `/table-billing`
2. QR Orders: `/qr-orders`
3. Order Live: `/order-live`
4. KOT: `/kot`
5. Reservations: `/reservations`
6. Delivery: `/delivery`
7. Recipes: `/recipes`

## 9. Role-Based Menu Behavior
1. Admin/Manager typically see broader menus.
2. Cashier/Waiter see focused billing-related menus.
3. If a menu is missing, verify role permissions first.

## 10. Troubleshooting
1. If page does not load: refresh and confirm network.
2. If menu is missing: check role/permission mapping.
3. If save fails: check backend service status and API connectivity.
4. For support issues: use `Support Tickets` (`/support-tickets`).

## 11. Daily Best Practice Checklist
1. Start with Home dashboard review.
2. Keep billing and stock updated during operations.
3. Record expenses on time.
4. Review dues and pending tasks before close.
5. Validate reports at end of day.

## 12. Training Notes
Use this sequence for new staff onboarding:
1. Login and Home
2. Billing basics
3. Customer and dues handling
4. Inventory basics
5. Reports and day-close awareness
6. Role-specific advanced menus
