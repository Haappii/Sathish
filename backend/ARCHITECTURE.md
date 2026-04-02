# Backend Architecture Guide

This backend is a FastAPI + SQLAlchemy + PostgreSQL application for a shop/hotel billing system.

It is not split into many microservices. Most business logic lives in one Python backend under `backend/app/`, with domain-specific route files and helper services.

## Stack

- Framework: FastAPI
- ORM: SQLAlchemy
- Database: PostgreSQL
- Validation: Pydantic
- Auth: JWT + bcrypt/passlib
- App server: Uvicorn
- Env loading: python-dotenv

## Folder Structure

```text
backend/
|-- app/
|   |-- main.py                  # FastAPI app entrypoint
|   |-- db.py                    # DB engine, session, Base, get_db()
|   |-- config.py                # JWT/env settings
|   |
|   |-- models/                  # SQLAlchemy table classes
|   |-- routes/                  # API endpoints (APIRouter files)
|   |-- schemas/                 # Pydantic request/response models
|   |-- services/                # Reusable business logic helpers
|   |-- utils/                   # Auth, permissions, branch/session helpers
|   |-- scripts/                 # Reset/seed helpers
|   `-- __init__.py
|-- migrations/                  # Raw SQL migration files
|-- uploads/                     # Uploaded files served by backend
|-- logs/                        # SQL logs
|-- requirements.txt
|-- .env.example
|-- LEARNING_PLAN.md
`-- ARCHITECTURE.md
```

## What Each Layer Does

### `app/main.py`

This is the application bootstrap file.

Responsibilities:

- Creates the FastAPI app
- Mounts static folders
- Configures CORS
- Imports all models before `Base.metadata.create_all(...)`
- Runs startup seed/init functions
- Registers every router
- Serves the built frontend if available

This is the first file to read because it shows the whole system at a glance.

### `app/db.py`

This is the database foundation.

Responsibilities:

- Loads `DATABASE_URL`
- Builds the SQLAlchemy engine
- Creates `SessionLocal`
- Defines the shared `Base`
- Exposes `get_db()` for FastAPI dependency injection

Nearly every route uses `Depends(get_db)` to get a DB session.

### `app/config.py`

Loads JWT-related settings from environment variables:

- `JWT_SECRET`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`

### `app/models/`

Each file defines one or more SQLAlchemy models mapped to database tables.

Examples:

- `users.py` -> users table
- `roles.py` -> roles table
- `shop_details.py` -> shop configuration
- `branch.py` -> branch records
- `items.py` -> product/item master
- `stock.py` -> inventory quantities
- `invoice.py` -> invoice header
- `invoice_details.py` -> invoice line items

Think of this folder as the database shape of the application.

### `app/schemas/`

These are Pydantic classes used for API input and output.

Examples:

- `schemas/items.py` defines `ItemCreate`, `ItemUpdate`, `ItemResponse`
- `schemas/invoice.py` defines `InvoiceCreate`, `InvoiceUpdate`, `InvoiceResponse`

Think of schemas as the API contract between frontend and backend.

### `app/routes/`

Each route file groups API endpoints for one domain.

Examples:

- `auth.py` -> login
- `users.py` -> user CRUD
- `category.py` -> category CRUD
- `items.py` -> item CRUD and image upload
- `invoice.py` -> billing flow
- `inventory.py` -> stock operations
- `reports.py` -> reporting endpoints
- `platform_owner.py` -> platform/admin operations
- `table_billing.py`, `table_qr.py`, `public_qr.py` -> hotel/table QR flow

This project has many route files because many business domains are handled in the same backend.

### `app/services/`

These files hold reusable business logic that is too big or too cross-cutting to leave inside routes.

Examples:

- `invoice_service.py` -> invoice number generation
- `inventory_service.py` -> stock add/remove logic
- `gst_service.py` -> GST calculation
- `credit_service.py` -> customer dues handling
- `audit_service.py` -> audit log creation
- `item_lot_service.py` -> FIFO lot consumption

Important: this project uses services as helper modules, but it is not a strict clean architecture or repository pattern. Many routes still query models directly.

### `app/utils/`

Cross-cutting helpers used by many routes.

Examples:

- `auth_user.py` -> decode JWT and load current user
- `jwt_token.py` -> create JWT tokens
- `passwords.py` -> hash/verify passwords
- `permissions.py` -> role/module permission checks
- `platform_owner_auth.py` -> platform owner auth helpers
- `shop_type.py` -> shop vs hotel behavior

### `app/scripts/`

Utility scripts for local/dev database reset and sample data seeding.

Examples:

- `db_reset.py`
- `reset_and_seed_cli.py`
- `seed_sample_shop.py`
- `seed_sample_hotel.py`

### `migrations/`

Raw SQL migrations used to evolve schema over time.

This codebase currently uses a hybrid style:

- startup uses `Base.metadata.create_all(...)`
- some schema changes are added through SQL files in `migrations/`
- one small startup auto-migration exists in `main.py` for demo/expiry columns

## How the App Starts

When the backend starts, the flow is roughly:

1. `config.py` and `db.py` load environment variables.
2. `db.py` creates the SQLAlchemy engine and session maker.
3. `main.py` imports all model files so SQLAlchemy knows every table.
4. FastAPI app is created.
5. Static directories and CORS are configured.
6. On startup, `Base.metadata.create_all(bind=engine)` runs.
7. Default roles, default shop, default branch, and default admin are seeded if missing.
8. All routers are mounted under `/api`.
9. The backend also serves the built frontend if `frontend/dist` exists.

## Core Request Flow

The normal backend flow looks like this:

```text
Frontend request
  -> FastAPI route in app/routes/
  -> FastAPI dependencies run
     - get_db()
     - get_current_user()
     - require_permission(...)
  -> Pydantic schema validates input
  -> Route queries models and/or calls services
  -> SQLAlchemy commits to PostgreSQL
  -> Pydantic response model (or raw dict) returned
```

## Example 1: Login Flow

Main files:

- `app/routes/auth.py`
- `app/utils/jwt_token.py`
- `app/utils/passwords.py`
- `app/utils/auth_user.py`

Flow:

1. `/api/auth/login` receives `shop_id`, `username`, and `password`.
2. Backend checks the shop exists and is not expired/disabled.
3. Backend loads the matching user for that shop.
4. Password is verified with bcrypt, with support for legacy plain/base64 passwords.
5. If password format is old, it is upgraded to bcrypt after successful login.
6. A JWT token is created with `user_id`, `role`, `branch_id`, and `shop_id`.
7. Later requests send that token in the Authorization header.
8. `get_current_user()` decodes the token and loads the full user from DB.

This is the main authentication pattern across the project.

## Example 2: Item CRUD Flow

Main files:

- `app/routes/items.py`
- `app/models/items.py`
- `app/models/stock.py`
- `app/schemas/items.py`
- `app/services/branch_item_price_service.py`
- `app/services/audit_service.py`

Flow:

1. Request hits `items.py`.
2. User is loaded with `get_current_user()` or `require_permission("items", ...)`.
3. Route determines branch scope using request headers and user role.
4. Input is validated by `ItemCreate` or `ItemUpdate`.
5. Route reads/writes the `Item` model directly.
6. Branch-specific price override is stored with `branch_item_price_service`.
7. A stock row is created if needed.
8. Audit log is written.
9. Response is returned as `ItemResponse`.

This is a good file for learning the general CRUD style used in the project.

## Example 3: Invoice / Billing Flow

Main files:

- `app/routes/invoice.py`
- `app/models/invoice.py`
- `app/models/invoice_details.py`
- `app/services/invoice_service.py`
- `app/services/gst_service.py`
- `app/services/inventory_service.py`
- `app/services/credit_service.py`
- `app/services/gift_card_service.py`
- `app/services/wallet_service.py`
- `app/services/audit_service.py`

This is the most important business flow in the backend.

Flow:

1. Request hits `/api/invoice/`.
2. Permission check ensures user can do billing.
3. Branch is resolved from user/header context.
4. Business date is derived from shop settings.
5. Day-close rules are checked.
6. Payload items are validated.
7. GST, totals, discounts, wallet, and gift-card values are calculated/validated.
8. Invoice header row is inserted.
9. Items are loaded from DB.
10. Inventory availability is checked.
11. Invoice detail rows are inserted.
12. Stock is reduced if inventory is enabled.
13. Gift card and wallet ledgers are updated if used.
14. Audit log is written.
15. Customer master and invoice due rows are updated for credit billing.

This file is large because it contains many business rules in one place.

## Important Data/Business Concepts

### Multi-tenant by `shop_id`

Most tables include `shop_id`. This means one backend can serve multiple shops, and nearly every query is scoped by shop.

### Branch-aware by `branch_id`

Many records are also branch-specific. Admins can sometimes see all branches; other roles are restricted to their own branch.

### Role + permission checks

There are two auth layers:

- authentication: who the user is
- authorization: what that user can do

Permission checks are often done with:

- `get_current_user()`
- `AdminOnly`
- `require_permission("module", "action")`

### Audit trail

Many create/update/delete operations call `log_action(...)` so changes are recorded in `audit_log`.

### Shop type behavior

Some flows behave differently depending on whether the shop is a `store` or `hotel`.

That affects areas like:

- item pricing rules
- inventory enforcement
- QR/table order flows

## Main Business Domains in `routes/`

- Identity and access: `auth.py`, `auth_branch.py`, `users.py`, `roles.py`, `permissions.py`
- Shop setup: `shop.py`, `setup_onboard.py`, `branch_routes.py`
- Product master: `category.py`, `items.py`, `pricing.py`
- Billing: `invoice.py`, `invoice_draft.py`, `returns.py`, `dues.py`
- Inventory: `inventory.py`, `inventory_bulk.py`, `stock_transfers.py`, `stock_audits.py`, `item_lots.py`
- Customer engagement: `customers.py`, `loyalty.py`, `coupons.py`, `gift_cards.py`
- Supplier/purchase: `suppliers.py`, `supplier_ledger.py`, `purchase_orders.py`
- Cash operations: `cash_drawer.py`, `expenses.py`, `day_close.py`
- Analytics/reporting: `dashboard.py`, `analytics.py`, `alerts.py`, `reports.py`
- Orders outside normal billing: `online_orders.py`, `public_qr.py`, `qr_orders.py`, `table_billing.py`, `table_qr.py`, `table_management.py`
- Platform-level admin: `support_chat.py`, `platform_owner.py`

## Best Order To Learn This Backend

Read in this order:

1. `app/main.py`
2. `app/db.py`
3. `app/config.py`
4. `app/utils/auth_user.py`
5. `app/utils/permissions.py`
6. `app/models/users.py`, `app/models/roles.py`, `app/models/shop_details.py`, `app/models/branch.py`
7. `app/routes/auth.py`
8. `app/routes/category.py`
9. `app/routes/items.py`
10. `app/routes/invoice.py`
11. `app/services/inventory_service.py`, `gst_service.py`, `credit_service.py`, `audit_service.py`
12. `app/routes/reports.py` only after you understand invoices and inventory

## Mental Model To Keep

If you remember just one thing, remember this:

```text
main.py wires everything
db.py gives sessions
models/ define tables
schemas/ define API shapes
routes/ handle requests
services/ hold reusable business rules
utils/ handle auth and cross-cutting helpers
```

That mental model will let you navigate almost any new feature in this backend.
