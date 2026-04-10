#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
DEPLOY_DIR="${ROOT_DIR}/deploy"
SERVICE_NAME="pos-backend"
NGINX_SITE_NAME="haappii-billing"
MIGRATIONS_DIR="${BACKEND_DIR}/migrations"
APPLIED_MIGRATIONS_FILE="${DEPLOY_DIR}/.applied_migrations"

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

PUBLIC_HOST="${PUBLIC_HOST:-_}"
RUN_USER="${SUDO_USER:-$(id -un)}"
SWAPFILE_PATH="${SWAPFILE_PATH:-/swapfile}"
SWAPFILE_SIZE_GB="${SWAPFILE_SIZE_GB:-2}"
FRONTEND_NODE_HEAP_MB="${FRONTEND_NODE_HEAP_MB:-1536}"
DB_NAME="${DB_NAME:-shop_billing}"
DB_USER="${DB_USER:-postgres}"

require_cmd() {
  local cmd="$1"
  local help_message="$2"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "${help_message}" >&2
    exit 1
  fi
}

require_node_runtime() {
  require_cmd node "Node.js is required. Install Node.js 22.x first."
  require_cmd npm "npm is required. Install Node.js 22.x first."

  local node_version major minor patch
  node_version="$(node -p "process.versions.node")"
  IFS=. read -r major minor patch <<< "${node_version}"

  if (( major < 20 )) || \
     (( major == 20 && minor < 19 )) || \
     (( major == 21 )) || \
     (( major == 22 && minor < 12 )); then
    echo "Detected Node.js ${node_version}. This project needs Node.js 20.19+ or 22.12+." >&2
    exit 1
  fi
}

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

require_cmd sudo "sudo is required for systemd/nginx installation."
require_cmd python3 "python3 is required. Install python3 and python3-venv first."
require_node_runtime

print_memory_snapshot() {
  if command -v free >/dev/null 2>&1; then
    free -h || true
  fi

  if command -v swapon >/dev/null 2>&1; then
    swapon --show || true
  fi
}

# ── 1. Pull latest code ────────────────────────────────────────────────────────
echo "==> Pulling latest code from git"
cd "${ROOT_DIR}"
git pull origin main

# ── 2. Clean temp / cache files ───────────────────────────────────────────────
echo "==> Cleaning build cache and temp files"

# Frontend: remove old dist and vite cache so build is always fresh
rm -rf "${FRONTEND_DIR}/dist"
rm -rf "${FRONTEND_DIR}/node_modules/.cache"
rm -rf "${FRONTEND_DIR}/.vite"
echo "    Removed frontend/dist, node_modules/.cache, .vite"

# Backend: remove Python bytecode cache
find "${BACKEND_DIR}" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${BACKEND_DIR}" -name "*.pyc" -delete 2>/dev/null || true
echo "    Removed backend __pycache__ and .pyc files"

# ── 3. Backend setup ──────────────────────────────────────────────────────────
echo "==> Backend setup"
cd "${BACKEND_DIR}"

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

"${VENV_PYTHON}" -m pip install --upgrade pip
"${VENV_PYTHON}" -m pip install -r requirements.txt

# ── 4. Run pending SQL migrations ─────────────────────────────────────────────
echo "==> Running database migrations"
touch "${APPLIED_MIGRATIONS_FILE}"

if [[ -d "${MIGRATIONS_DIR}" ]]; then
  for sql_file in $(ls "${MIGRATIONS_DIR}"/*.sql 2>/dev/null | sort); do
    filename="$(basename "${sql_file}")"
    if grep -qxF "${filename}" "${APPLIED_MIGRATIONS_FILE}"; then
      echo "    [skip] ${filename} (already applied)"
    else
      echo "    [run]  ${filename}"
      sudo -u "${DB_USER}" psql "${DB_NAME}" -f "${sql_file}"
      echo "${filename}" >> "${APPLIED_MIGRATIONS_FILE}"
    fi
  done
else
  echo "    No migrations directory found, skipping."
fi

# ── 5. Ensure swap space ──────────────────────────────────────────────────────
echo "==> Ensuring swap space (prevents Node.js heap OOM on low-RAM servers)"
if ! swapon --show | grep -q "${SWAPFILE_PATH}"; then
  if [[ ! -f "${SWAPFILE_PATH}" ]]; then
    echo "Creating ${SWAPFILE_SIZE_GB} GB swapfile at ${SWAPFILE_PATH}..."
    sudo fallocate -l "${SWAPFILE_SIZE_GB}G" "${SWAPFILE_PATH}"
    sudo chmod 600 "${SWAPFILE_PATH}"
    sudo mkswap "${SWAPFILE_PATH}"
  fi
  sudo swapon "${SWAPFILE_PATH}"
  echo "Swap enabled."
else
  echo "Swap already active, skipping."
fi

echo "==> Memory snapshot before frontend build"
print_memory_snapshot

# ── 6. Frontend build ─────────────────────────────────────────────────────────
echo "==> Frontend build"
cd "${FRONTEND_DIR}"
npm install
echo "    Using Node heap limit: ${FRONTEND_NODE_HEAP_MB} MB"
if ! NODE_OPTIONS="--max-old-space-size=${FRONTEND_NODE_HEAP_MB}" VITE_API_BASE=/api npm run build; then
  echo "Frontend build failed. If you saw 'Killed', the Linux OOM killer likely stopped Vite." >&2
  echo "Memory snapshot after failure:" >&2
  print_memory_snapshot >&2
  exit 1
fi

# ── 7. Install / update backend systemd service ───────────────────────────────
echo "==> Installing backend systemd service"
TMP_SERVICE="$(mktemp)"
cat > "${TMP_SERVICE}" <<EOF
[Unit]
Description=Haappii Billing Backend (FastAPI/Uvicorn)
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${BACKEND_DIR}
Environment=PYTHONUNBUFFERED=1
ExecStart=${BACKEND_DIR}/venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo cp "${TMP_SERVICE}" "/etc/systemd/system/${SERVICE_NAME}.service"
rm -f "${TMP_SERVICE}"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"
echo "    Backend service restarted."

# ── 8. Install / update nginx ─────────────────────────────────────────────────
echo "==> Installing nginx site"
TMP_NGINX="$(mktemp)"
cat > "${TMP_NGINX}" <<EOF
server {
    listen 80;
    server_name ${PUBLIC_HOST} _;

    root ${FRONTEND_DIR}/dist;
    index index.html;

    location /assets/ {
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location /downloads/ {
        alias ${ROOT_DIR}/downloads/;
        try_files \$uri =404;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

sudo apt-get update -qq
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp "${TMP_NGINX}" "/etc/nginx/sites-available/${NGINX_SITE_NAME}"
rm -f "${TMP_NGINX}"
sudo ln -sf "/etc/nginx/sites-available/${NGINX_SITE_NAME}" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
echo "    Nginx restarted."

# ── 9. Re-apply SSL (certbot keeps HTTPS after nginx config regeneration) ─────
if [[ "${PUBLIC_HOST}" != "_" && "${PUBLIC_HOST}" != "" ]]; then
  echo "==> Re-applying SSL certificate for ${PUBLIC_HOST}"
  sudo certbot --nginx -d "${PUBLIC_HOST}" \
    --non-interactive --agree-tos \
    -m "${CERTBOT_EMAIL:-haappiigaming@gmail.com}" \
    --redirect \
    --keep-until-expiring 2>&1 || echo "    Certbot skipped (cert still valid or domain not reachable)."
  sudo systemctl reload nginx
  echo "    SSL applied."
fi

# ── 10. Health check ──────────────────────────────────────────────────────────
echo "==> Health check"
sleep 3
HEALTH="$(curl -s http://127.0.0.1:8000/api/health || echo 'UNREACHABLE')"
echo "    Backend: ${HEALTH}"

if [[ "${PUBLIC_HOST}" != "_" && "${PUBLIC_HOST}" != "" ]]; then
  HTTP_STATUS="$(curl -sk -o /dev/null -w '%{http_code}' "https://${PUBLIC_HOST}/" 2>/dev/null || echo '000')"
  echo "    Site   : HTTPS ${HTTP_STATUS}"
fi

echo
echo "=========================================="
echo "  Production deployment complete."
echo "  Health:  http://127.0.0.1:8000/api/health"
echo "  Public:  https://${PUBLIC_HOST}/"
echo "=========================================="
