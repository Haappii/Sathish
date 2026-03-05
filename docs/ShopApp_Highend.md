# Shop Billing Application — High-End Overview

Version: 2026.02 • Authors: ShopApp team • Scope: Product + Architecture + Ops

## 1) Purpose & Positioning
- Modern multi-branch POS + billing platform for SMEs and franchises.
- Optimized for fast checkout, auditable reporting, and secure role-based access.
- Channels: web (React), desktop (packaged frontend), Android APK; common FastAPI backend.

## 2) Core Value
- **Speed & accuracy:** table billing or counter invoicing with GST/tax, discounts, rounding.
- **Visibility:** branch-wise and consolidated sales/stock reports with branded PDF/Excel exports.
- **Governance:** role-based access, branch scoping, audit logs, configurable parameters.
- **Low-friction rollout:** installers/APK served via backend downloads endpoints.

## 3) Primary Users
- Cashiers/Billing Staff: fast item lookup, billing, receipt/exports.
- Branch Managers: branch KPIs, stock movements, expense logging, day/month close.
- Owners/Admins: multi-branch oversight, user/role management, consolidated reports.
- Support/Ops: audit logs, support tickets, platform onboard requests.

## 4) System Architecture (Logical)
- **Frontend:** React SPA; Axios client with JWT; asset bundles for installers/APK.
- **Backend:** FastAPI 1.0.0, SQLAlchemy 2.x, Pydantic v2, service-layer pattern.
- **Auth:** JWT access tokens; role + branch scoping; platform user flow for onboarding.
- **Database:** PostgreSQL (default); schema covers users, roles, branch, items, invoices, stock, loyalty, coupons, gift cards, subscriptions, audit/support.
- **Static delivery:** `/api/uploads` for media; `/downloads` for installers; `/api/item-images`, `/api/shop-logos`.

## 5) Key Functional Areas
- Billing & Invoicing: invoice, invoice details, drafts, returns, discounts, payments, dues.
- Inventory & Pricing: stock, stock ledger, stock transfer, stock audit, item lots, item prices.
- Branch & User Admin: branch setup, role/permission, user lifecycle, platform users.
- Financial Ops: branch expenses, cash drawer, supplier ledger, purchase orders (+ attachments).
- Engagement: coupons, loyalty, gift cards & transactions, subscriptions.
- Supportability: audit log, support tickets, platform onboard requests.

## 6) Data Highlights (Selected Tables)
- `users`, `roles`, `role_permission`
- `branch`, `shop_details`, `system_parameters`
- `items`, `item_price`, `item_lot`
- `invoice`, `invoice_details`, `invoice_payment`, `invoice_due`, `invoice_discount`, `invoice_archive`
- `stock`, `stock_ledger`, `stock_transfer`, `stock_audit`
- `supplier`, `purchase_order`, `purchase_order_attachment`, `supplier_ledger`
- `customer`, `customer_wallet_txn`, `gift_card`, `gift_card_txn`, `loyalty`, `coupon`
- `table_billing`, `table_qr` (optional module)
- `audit_log`, `support_ticket`, `platform_onboard_request`

## 7) Critical Flows (Happy Path)
1. **Login** → JWT issued → role + branch scoped.
2. **Billing** → item lookup → discounts/GST → invoice + invoice_details persisted → optional payment/dues → receipt/export.
3. **Stock Movement** → purchase order or transfer → stock + ledger update → branch inventory view.
4. **Reporting** → request report (branch/all) → backend aggregate query → PDF/Excel export with branding.
5. **Table Billing (if enabled)** → table open → add items → settle → invoice creation + table release.

## 8) Security & Compliance
- JWT auth; recommend secrets via env vars and rotation.
- Password handling currently Base64 per legacy requirement; roadmap to bcrypt/argon2.
- CORS open for dev; restrict origins + HTTPS in prod.
- Audit logging of sensitive operations; recommend rate limiting and brute-force protection.
- Data protection: TLS in transit; DB backups; minimal PII (customer contact, GST fields).

## 9) Performance & Scalability (Targets)
- P99 invoice creation < 400 ms on modest infra (2 vCPU, 4 GB RAM, Postgres 2 vCPU/4 GB).
- Report generation offloaded to optimized SQL; prefer pagination and date filters.
- Asset delivery via static mounts; recommend CDN for installers/APK in internet-facing deployments.

## 10) Reliability & Operations
- Health check endpoint should verify DB connectivity (`SELECT 1`) before 200 OK.
- Backups: daily logical dump; weekly full; retention 30 days.
- Monitoring: request latency, DB slow queries, auth failures, error rate; log aggregation.
- Incident playbook: invalidate compromised JWT secret, rotate credentials, restore from backup.

## 11) Deployment Options
- **Local/dev:** uvicorn `app.main:app --reload`, Postgres container.
- **Production:** gunicorn/uvicorn workers behind Nginx; Postgres managed (RDS/Azure PG).
- **Packaging:** docker-compose for app + DB; CI pipeline to run lint/tests/migrations (roadmap).
- **Static assets:** `downloads/` for installers; versioned filenames recommended.

## 12) Integration Points
- Export formats: PDF, Excel.
- Optional: SMTP/SMS for OTP/login notifications (not yet wired; add via FastAPI deps).
- Payment gateways not bundled; invoices accommodate discounts/taxes for POS use.

## 13) Testing & Quality (Current Gaps)
- pytest scaffolding planned; needs DB fixtures and TestClient.
- Add linting (ruff/black) and CI workflow for PR gates.
- Suggested coverage: auth, billing happy path, stock transfer, report filters, permissions.

## 14) Roadmap (Next 3–6 Months)
- Secure password hashing (bcrypt/argon2) + secret rotation policy.
- Role-permission matrix per module; fine-grained RBAC UI.
- OTP-based login and device binding.
- Advanced analytics dashboards and scheduled report emails.
- Cloud backup integration and configurable retention.
- Hardening: rate limiting, request size limits, audit export.

## 15) KPIs & SLAs (Suggested)
- Checkout latency (P95) ≤ 300 ms; P99 ≤ 400 ms.
- Export generation success ≥ 99.5% per day.
- Auth failure anomaly alert: >5% failures in 5 minutes.
- Data integrity: zero orphaned invoice_details; nightly constraint check.
- Uptime target: 99.5% monthly (single-region); 99.9% with multi-AZ DB.

## 16) Risks & Mitigations
- **Credential exposure:** enforce env-based secrets, rotate quarterly.
- **Slow reports on large datasets:** add indexes on date/branch/item, pre-aggregations for monthly summaries.
- **Open CORS in prod:** lock to allowed origins and enforce HTTPS.
- **Legacy password scheme:** prioritize migration to hashed passwords with staged rollout.

## 17) Artefacts & References
- Code: `backend/app`, `frontend/`, `desktop-app/`, `mobile-app/`.
- Docs: `docs/ShopApp_Full_Pack.md` (business), `docs/Haappii_Billing_Business_Design_Document.pdf`.
- Migrations: `backend/migrations/`.
- Installers/APK: `downloads/`.

---
Ready for stakeholder review; adjust KPIs/SLAs per deployment scale and customer contract.
