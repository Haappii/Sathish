#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="${BASE_DIR}/.pids"
mkdir -p "${PID_DIR}"

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

echo "Starting backend (8000)..."
cd "${BASE_DIR}/backend"
if [[ ! -d "venv" ]]; then
  echo "ERROR: backend/venv not found. Create it and install requirements first."
  exit 1
fi
source venv/bin/activate
: > "${BACKEND_LOG}"
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "${BACKEND_LOG}" 2>&1 &
echo $! > "${BACKEND_PID_FILE}"

echo "Building + starting frontend preview (5173)..."
cd "${BASE_DIR}/frontend"
: > "${FRONTEND_LOG}"

echo "  - Node: $(node -v 2>/dev/null || echo 'NOT FOUND')"
echo "  - NPM : $(npm -v 2>/dev/null || echo 'NOT FOUND')"

if [[ -f "package-lock.json" ]]; then
  echo "  - npm ci (this can take 1–5 minutes on small EC2)..."
  npm ci >> "${FRONTEND_LOG}" 2>&1
else
  echo "  - npm install (this can take 1–5 minutes on small EC2)..."
  npm install >> "${FRONTEND_LOG}" 2>&1
fi

echo "  - npm run build..."
npm run build >> "${FRONTEND_LOG}" 2>&1
echo "  - npm run preview (bind 0.0.0.0:5173)..."
nohup npm run preview >> "${FRONTEND_LOG}" 2>&1 &
echo $! > "${FRONTEND_PID_FILE}"

echo "Verifying ports..."
if command -v ss >/dev/null 2>&1; then
  ss -ltnp | egrep ':8000|:5173' || true
fi

if command -v curl >/dev/null 2>&1; then
  echo "Verifying local health..."
  curl -sS -m 5 -I http://127.0.0.1:8000/api/health >/dev/null || true
  curl -sS -m 5 -I http://127.0.0.1:5173/ >/dev/null || true
fi

echo "Started:"
echo "  Backend health:  http://13.60.186.234:8000/api/health"
echo "  Frontend:        http://13.60.186.234:5173/"
echo "Logs:"
echo "  tail -f \"${BACKEND_LOG}\" \"${FRONTEND_LOG}\""
