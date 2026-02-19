#!/usr/bin/env bash
set -euo pipefail

# Minimal runner: mirrors the exact commands requested and binds both servers
# to 0.0.0.0 so they are reachable from any IP.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5180}"

# Used by the desktop-app build/run (Electron wrapper) to know which web URL to load.
# For EC2, set PUBLIC_HOST to your public IP or domain.
PUBLIC_HOST="${PUBLIC_HOST:-localhost}"
export APP_URL="${APP_URL:-http://${PUBLIC_HOST}:${FRONTEND_PORT}}"

# --- Backend ---
cd "${ROOT_DIR}/backend"

# python -m venv venv
if [[ ! -d "venv" ]]; then
  if command -v python >/dev/null 2>&1; then
    python -m venv venv
  else
    python3 -m venv venv
  fi
fi

# venv\Scripts\activate (Windows) or venv/bin/activate (Linux/macOS)
if [[ -f "venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
elif [[ -f "venv/Scripts/activate" ]]; then
  # shellcheck disable=SC1091
  source venv/Scripts/activate
else
  echo "venv activate script not found" >&2
  exit 1
fi

# pip install fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv passlib[bcrypt] bcrypt==4.0.1
pip install fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv "passlib[bcrypt]" "bcrypt==4.0.1"

# pip freeze > requirements.txt
pip freeze > requirements.txt

# uvicorn app.main:app --reload (bind all interfaces)
uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" &
BACKEND_PID=$!
trap 'kill ${BACKEND_PID} 2>/dev/null || true' EXIT

# --- Frontend ---
cd "${ROOT_DIR}/frontend"

# npm run dev (bind all interfaces)
npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
