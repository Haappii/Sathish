#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${BASE_DIR}/logs"
PID_DIR="${LOG_DIR}/pids"
mkdir -p "${PID_DIR}"

BACKEND_LOG="${LOG_DIR}/backend.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"
BACKEND_PID_FILE="${PID_DIR}/backend.pid"
FRONTEND_PID_FILE="${PID_DIR}/frontend.pid"

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

if [[ -f "package-lock.json" ]]; then
  npm ci >> "${FRONTEND_LOG}" 2>&1
else
  npm install >> "${FRONTEND_LOG}" 2>&1
fi

npm run build >> "${FRONTEND_LOG}" 2>&1
nohup npm run preview >> "${FRONTEND_LOG}" 2>&1 &
echo $! > "${FRONTEND_PID_FILE}"

echo "Started:"
echo "  Backend health:  http://13.60.186.234:8000/api/health"
echo "  Frontend:        http://13.60.186.234:5173/"
echo "Logs:"
echo "  tail -f \"${BACKEND_LOG}\" \"${FRONTEND_LOG}\""

