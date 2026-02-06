# Shop Billing Application — Full Documentation Pack

**Audience:** Mixed (business + technical)  
**Version:** 1.0  
**Build:** 2026.02  
**Prepared for:** Shop Billing App stakeholders  

---

## 1. Executive Summary
The Shop Billing Application is a modern POS and billing system designed for multi‑branch retail operations. It combines fast billing, inventory controls, and rich reporting with role‑based access and branch‑level governance. The system is optimized for in‑store operations, back‑office reporting, and auditable workflows.

**Highlights**
- Fast invoicing and table billing workflows
- Branch‑wise sales and consolidated reporting
- Role‑based access and operational visibility
- Exportable PDF/Excel reports with branded headers
- Lightweight deployment (FastAPI + React)

---

## 2. Product Overview
**Primary Users**
- Cashiers / Billing Staff
- Branch Managers
- Store Owners / Admins

**Core Modules**
- Billing & Invoice Management
- Inventory & Stock Movement
- Branch & User Administration
- Reports & Analytics
- Table Billing (optional)

**Key Benefits**
- Faster checkout and reduced billing errors
- Real‑time visibility of branch performance
- Centralized reporting and export capabilities
- Secure access control and audit‑trail readiness

---

## 3. Feature Set
**Billing & Invoices**
- Standard billing with invoice number generation
- Item‑wise, category‑wise, and user‑wise sales reports
- Discount, GST/tax, and grand total calculations

**Inventory**
- Current stock and movement reports
- Branch‑wise stock management

**Reports**
- Sales summary, item‑wise, category‑wise, user‑wise
- Branch performance reporting
- Export to PDF/Excel with branding

**Administration**
- User creation, activation/deactivation
- Role‑based access control (Admin/User)
- Branch list and branch address details

---

## 4. User Roles & Access
**Admin**
- Full access to all reports and branch data
- User management and branch setup

**User**
- Access limited to assigned branch
- Billing and operational reports for their branch

---

## 5. System Architecture
**Frontend**
- React SPA (Single Page Application)
- Axios API client with JWT token handling

**Backend**
- FastAPI (Python)
- SQLAlchemy ORM
- JWT‑based authentication

**Database**
- Relational DB (schema includes Users, Branch, Invoice, InvoiceDetails, Items)

---

## 6. Security & Authentication
**Current Security Controls**
- JWT access tokens for API authentication
- Session idle timeout on frontend
- Role‑based access in backend routes

**Password Handling (Current)**
- Passwords encoded as Base64 (per requirement)

**Recommended Security Enhancements**
- Replace Base64 with secure hashing (bcrypt/argon2)
- Rotate JWT secrets and store them in environment variables
- HTTPS/TLS for all deployments
- Rate limiting and brute‑force protection

---

## 7. Deployment Guide
**Prerequisites**
- Node.js (Frontend)
- Python 3.10+ (Backend)
- Database (PostgreSQL/MySQL/SQLite)

**Backend**
1. Set environment variables:
   - `JWT_SECRET`
   - `JWT_ALGORITHM`
   - `ACCESS_TOKEN_EXPIRE_MINUTES`
2. Run FastAPI server:
   - `uvicorn app.main:app --reload`

**Frontend**
1. Install dependencies: `npm install`
2. Run dev server: `npm run dev`

---

## 8. Operational Workflows
**Daily Operations**
- Login → Billing → Print/Export → Reports

**Weekly / Monthly**
- Sales summary by branch
- Stock movement reconciliation

---

## 9. Report Exports
PDF/Excel exports include:
- Logo
- Shop name + branch name
- Branch address
- Phone and GSTIN
- Report title with date range

---

## 10. Support & Maintenance
**Recommended**
- Daily database backup
- Monthly audit of users & branch access
- Update dependencies quarterly

---

## 11. Roadmap (Suggested)
- OTP‑based login
- Role permissions per module
- Advanced analytics dashboards
- Cloud backup integration

---

## 12. Appendix
**Key Environment Variables**
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`

**Versioning**
- App Version: 1.0
- Build Code: 2026.02

---

End of Document
