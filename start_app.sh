#!/usr/bin/env bash
set -euo pipefail

# Minimal runner: mirrors the exact commands requested and binds both servers
# to 0.0.0.0 so they are reachable from any IP.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_EXAMPLE_FILE="${ROOT_DIR}/config.example.txt"
CONFIG_FILE="${ROOT_DIR}/config.txt"
ENV_FILE="${ROOT_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(sed 's/\r$//' "${ENV_FILE}")
  set +a
fi

if [[ -f "${CONFIG_EXAMPLE_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(sed 's/\r$//' "${CONFIG_EXAMPLE_FILE}")
  set +a
fi

if [[ -f "${CONFIG_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(sed 's/\r$//' "${CONFIG_FILE}")
  set +a
fi

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# Optional: run a second frontend port intended for the desktop wrapper URL.
# Note: this is still the same web app; it just runs on a different port.
DESKTOP_FRONTEND_PORT="${DESKTOP_FRONTEND_PORT:-5180}"

# Used by the desktop-app build/run (Electron wrapper) to know which web URL to load.
# For EC2, set PUBLIC_HOST to your public IP or domain.
PUBLIC_HOST="${PUBLIC_HOST:-localhost}"
export APP_URL="${APP_URL:-http://${PUBLIC_HOST}:${DESKTOP_FRONTEND_PORT}}"

# About page download links (Vite dev env vars; also useful for preview builds).
# Use relative URLs so they work on EC2 public IP without hardcoding localhost.
# Vite dev server proxies `/api` and `/downloads` to the backend (see `frontend/vite.config.js`).
export VITE_API_BASE="${VITE_API_BASE:-/api}"
export VITE_WINDOWS_APP_URL="${VITE_WINDOWS_APP_URL:-/downloads/poss-desktop-setup.exe}"
export VITE_ANDROID_APK_URL="${VITE_ANDROID_APK_URL:-/downloads/haappii-billing.apk}"

DOWNLOADS_BASE_URL="${DOWNLOADS_BASE_URL:-http://${PUBLIC_HOST}:${BACKEND_PORT}/downloads}"

# Helpful startup info
echo "API:        http://${PUBLIC_HOST}:${BACKEND_PORT}/api"
echo "Web UI:     http://${PUBLIC_HOST}:${FRONTEND_PORT}"
echo "Desktop UI: http://${PUBLIC_HOST}:${DESKTOP_FRONTEND_PORT} (same UI; desktop wrapper points here)"
echo "Downloads:  ${DOWNLOADS_BASE_URL} (also available via Web UI: ${VITE_WINDOWS_APP_URL})"
echo "Windows EXE expected at: ${ROOT_DIR}/downloads/poss-desktop-setup.exe"

# --- Backend ---
cd "${ROOT_DIR}/backend"

create_backend_venv() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv venv
  elif command -v python >/dev/null 2>&1; then
    python -m venv venv
  else
    echo "Python 3 not found. Install python3 and python3-venv." >&2
    exit 1
  fi
}

resolve_venv_python() {
  if [[ -x "venv/bin/python" ]]; then
    echo "venv/bin/python"
    return 0
  fi

  if [[ -x "venv/Scripts/python.exe" ]]; then
    echo "venv/Scripts/python.exe"
    return 0
  fi

  return 1
}

require_node_runtime() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Node.js and npm are required for the frontend.
This project uses Vite 7, which requires Node.js 20.19+ or 22.12+.

Install Node.js 22.x on Ubuntu with:
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs

Then rerun:
  ./start_app.sh
EOF
    exit 1
  fi

  local node_version
  node_version="$(node -p "process.versions.node")"

  local major=0
  local minor=0
  local patch=0
  IFS=. read -r major minor patch <<< "${node_version}"

  if (( major < 20 )) || \
     (( major == 20 && minor < 19 )) || \
     (( major == 21 )) || \
     (( major == 22 && minor < 12 )); then
    cat >&2 <<EOF
Detected Node.js ${node_version}, but this project uses Vite 7 and needs Node.js 20.19+ or 22.12+.

Recommended Ubuntu install:
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs

Then rerun:
  ./start_app.sh
EOF
    exit 1
  fi
}

# Create venv if missing, or recreate it if the directory exists but is invalid.
if [[ ! -d "venv" ]]; then
  create_backend_venv
elif ! VENV_PYTHON="$(resolve_venv_python)"; then
  echo "Existing backend/venv is incomplete. Recreating it..."
  rm -rf venv
  create_backend_venv
fi

if ! VENV_PYTHON="$(resolve_venv_python)"; then
  echo "venv python executable not found after recreation. Install python3-venv and try again." >&2
  exit 1
fi

if [[ ! -f "requirements.txt" ]]; then
  echo "backend/requirements.txt not found" >&2
  exit 1
fi

# Install dependencies into the virtualenv itself.
"${VENV_PYTHON}" -m pip install --upgrade pip
"${VENV_PYTHON}" -m pip install -r requirements.txt

# uvicorn app.main:app --reload (bind all interfaces)
"${VENV_PYTHON}" -m uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" &
BACKEND_PID=$!
trap 'kill ${BACKEND_PID} 2>/dev/null || true' EXIT

# --- Frontend ---
cd "${ROOT_DIR}/frontend"

require_node_runtime

if [[ ! -d "node_modules" ]]; then
  npm install
fi

# Desktop port (background)
npm run dev -- --strictPort --host "${FRONTEND_HOST}" --port "${DESKTOP_FRONTEND_PORT}" &
DESKTOP_FE_PID=$!
trap 'kill ${BACKEND_PID} ${DESKTOP_FE_PID} 2>/dev/null || true' EXIT

# Web port (foreground)
npm run dev -- --strictPort --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
