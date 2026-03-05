# Backend Learning Plan (Shop Billing App)

Purpose: become self-sufficient adding features, APIs, and tests to this FastAPI + SQLAlchemy + Postgres backend while building portfolio-ready proof of work.

## Current Stack Snapshot
- Framework: FastAPI (`app/main.py`)
- ORM: SQLAlchemy 2.x (`app/db.py`, `app/models/`)
- DB: Postgres (default `postgresql://postgres:postgres@localhost:5432/shop_billing`)
- Auth/security libs: bcrypt, python-jose, passlib
- Tooling: uvicorn, pydantic v2, python-dotenv, pytest (not yet configured), raw SQL migrations in `backend/migrations/`

## Roadmap (5 Weeks, 60–90 min/day)
Week 1 – Python & project tour  
- Refresh typing, dataclasses, context managers, error handling.  
- Walk the codebase: skim `app/main.py`, `app/models/`, `app/routes/`, `app/services/`.  
- Run the app locally; confirm `/docs` works.

Week 2 – FastAPI routing pattern  
- Study path/response models (Pydantic v2) and dependency injection.  
- Add one thin slice: new GET route that returns a DB row via a service function.  
- Document route in OpenAPI; try swagger UI.

Week 3 – Data layer & migrations  
- Read `app/db.py`; trace a model → schema → route flow.  
- Create a migration that mirrors the style of `migrations/20260301_add_gst_reporting_fields.sql`.  
- Update the corresponding SQLAlchemy model and Pydantic schema.

Week 4 – Testing & quality  
- Set up pytest fixtures for a TestClient and a temp Postgres (or SQLite if acceptable).  
- Write tests for the Week 2 slice (happy path + validation failure).  
- Add lint/format commands (ruff/black) and a Makefile/ps script to run them.

Week 5 – Packaging & portfolio polish  
- Dockerize: app + Postgres via docker-compose.  
- Add CI (GitHub Actions) for lint + test + migrations check.  
- Produce short docs and screenshots for your profile.

## Daily Loop (repeatable)
1) 15m learn: read one focused topic (FastAPI deps, SQLAlchemy sessions, pytest fixtures).  
2) 45m build: apply it to this repo (model + schema + route + test).  
3) 10m notes: capture what you changed and next blockers.

## Practice Tasks Inside This Repo
- Migrate GST fields end-to-end: apply `migrations/20260301_add_gst_reporting_fields.sql`, update the matching model/schema/service, and expose a route to read/write those fields.  
- Add a health check that hits the DB (`SELECT 1`) and returns latency.  
- Implement one CRUD entity (e.g., `category` or `supplier`): route → service → model → test.  
- Add pagination and filtering to an existing list endpoint.  
- Write an integration test using `httpx.AsyncClient` + FastAPI `lifespan` if needed.

## Proof Artifacts for Your Portfolio
- `README.md`: quickstart, feature list, stack, screenshots/GIF of `/docs`.  
- `backend/ARCHITECTURE.md`: folder layout and request flow (router → service → repo → DB).  
- `backend/ERD.png`: small ER diagram highlighting GST additions.  
- Postman/Insomnia collection exported from live `/docs`.  
- Test badge/summary showing key scenarios covered.

## Handy Commands
- Create env: `python -m venv venv && venv\\Scripts\\activate` (Windows)  
- Install deps: `pip install -r requirements.txt`  
- Run API: `uvicorn app.main:app --reload`  
- Format/lint (when added): `ruff check .` / `black .`  
- Tests (after pytest setup): `pytest -q`

Keep this file updated: jot what you finished each day and next targets so re-entry is fast.
