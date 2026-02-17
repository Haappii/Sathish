#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="${BASE_DIR}/.pids"
mkdir -p "${PID_DIR}"

# ---- Config (override via env vars) ----
# PUBLIC_HOST: public IPv4 / domain used by clients (for API base in frontend build)
# BACKEND_PORT: uvicorn port
# FRONTEND_PORT: vite port (configured in frontend/package.json too)
# FRONTEND_MODE: preview (recommended) | dev
PUBLIC_HOST="${PUBLIC_HOST:-13.60.186.234}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_MODE="${FRONTEND_MODE:-preview}"

# Frontend API base (Vite build-time env). Override if needed:
#   export VITE_API_BASE="http://<ip>:8000/api"
export VITE_API_BASE="${VITE_API_BASE:-http://${PUBLIC_HOST}:${BACKEND_PORT}/api}"

# Keep logs in repo root (easy to find on EC2)
BACKEND_LOG="${BASE_DIR}/backend.log"
FRONTEND_LOG="${BASE_DIR}/frontend.log"
BACKEND_PID_FILE="${PID_DIR}/backend.pid"
FRONTEND_PID_FILE="${PID_DIR}/frontend.pid"

on_err() {
  echo ""
  echo "ERROR: start_app.sh failed (line ${BASH_LINENO[0]})."
  echo "---- backend.log (last 80) ----"
  tail -n 80 "${BACKEND_LOG}" 2>/dev/null || true
  echo "---- frontend.log (last 120) ----"
  tail -n 120 "${FRONTEND_LOG}" 2>/dev/null || true
}
trap on_err ERR

kill_pid_file() {
  local pid_file="$1"
  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${pid}" 2>/dev/null || true
    fi
    rm -f "${pid_file}" || true
  fi
}

echo "Stopping previous processes (if any)..."
kill_pid_file "${BACKEND_PID_FILE}"
kill_pid_file "${FRONTEND_PID_FILE}"

pkill -f "uvicorn app\\.main:app" 2>/dev/null || true
pkill -f "vite(\\s|$)" 2>/dev/null || true

echo "Starting backend (${BACKEND_PORT})..."
cd "${BASE_DIR}/backend"
if [[ ! -d "venv" ]]; then
  echo "  - creating python venv..."
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv venv
  else
    python -m venv venv
  fi
fi
source venv/bin/activate
echo "  - installing backend requirements..."
pip install -r requirements.txt >/dev/null
: > "${BACKEND_LOG}"
nohup uvicorn app.main:app --host 0.0.0.0 --port "${BACKEND_PORT}" > "${BACKEND_LOG}" 2>&1 &
echo $! > "${BACKEND_PID_FILE}"

echo "Building + starting frontend (${FRONTEND_MODE}) on (${FRONTEND_PORT})..."
cd "${BASE_DIR}/frontend"
: > "${FRONTEND_LOG}"

echo "  - Node: $(node -v 2>/dev/null || echo 'NOT FOUND')"
echo "  - NPM : $(npm -v 2>/dev/null || echo 'NOT FOUND')"
echo "  - VITE_API_BASE: ${VITE_API_BASE}"

if [[ ! -d "node_modules" ]]; then
  if [[ -f "package-lock.json" ]]; then
    echo "  - npm ci (first run can take 1–5 minutes on small EC2)..."
    npm ci >> "${FRONTEND_LOG}" 2>&1
  else
    echo "  - npm install (first run can take 1–5 minutes on small EC2)..."
    npm install >> "${FRONTEND_LOG}" 2>&1
  fi
else
  echo "  - node_modules exists (skipping install)"
fi

if [[ "${FRONTEND_MODE}" == "preview" ]]; then
  if [[ ! -d "dist" ]]; then
    echo "  - dist/ missing; running npm run build..."
    npm run build >> "${FRONTEND_LOG}" 2>&1
  else
    echo "  - dist/ exists (skipping build)"
  fi
  echo "  - npm run preview (bind 0.0.0.0:${FRONTEND_PORT})..."
  nohup npm run preview >> "${FRONTEND_LOG}" 2>&1 &
else
  echo "  - npm run dev (bind 0.0.0.0:${FRONTEND_PORT})..."
  nohup npm run dev >> "${FRONTEND_LOG}" 2>&1 &
fi
echo $! > "${FRONTEND_PID_FILE}"

echo "Verifying ports..."
if command -v ss >/dev/null 2>&1; then
  ss -ltnp | egrep ":${BACKEND_PORT}|:${FRONTEND_PORT}" || true
fi

if command -v curl >/dev/null 2>&1; then
  echo "Verifying local health..."
  curl -sS -m 5 -I "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null || true
  curl -sS -m 5 -I "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null || true
fi

echo "Started:"
echo "  Backend health:  http://${PUBLIC_HOST}:${BACKEND_PORT}/api/health"
echo "  Frontend:        http://${PUBLIC_HOST}:${FRONTEND_PORT}/"
echo "Logs:"
echo "  tail -f \"${BACKEND_LOG}\" \"${FRONTEND_LOG}\""
