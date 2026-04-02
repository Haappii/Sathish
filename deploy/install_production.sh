#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
DEPLOY_DIR="${ROOT_DIR}/deploy"
SERVICE_NAME="pos-backend"
NGINX_SITE_NAME="haappii-billing"

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

echo "==> Frontend build"
cd "${FRONTEND_DIR}"
npm install
VITE_API_BASE=/api npm run build

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
sudo systemctl enable --now "${SERVICE_NAME}"

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

sudo apt-get update
sudo apt-get install -y nginx
sudo cp "${TMP_NGINX}" "/etc/nginx/sites-available/${NGINX_SITE_NAME}"
rm -f "${TMP_NGINX}"
sudo ln -sf "/etc/nginx/sites-available/${NGINX_SITE_NAME}" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl restart nginx

echo
echo "Production deployment complete."
echo "Health:  http://127.0.0.1:8000/api/health"
echo "Public:  http://${PUBLIC_HOST}/"
