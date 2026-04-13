#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

for env_file in .env backend/.env config.example.txt config.txt; do
  if [ -f "${env_file}" ]; then
    set -a
    # shellcheck disable=SC1090
    source <(sed 's/\r$//' "${env_file}")
    set +a
  fi
done

echo "==> Pulling latest code from git"
git pull origin main

echo "==> Cleaning build cache and temp files"
rm -rf frontend/dist frontend/node_modules/.cache frontend/.vite
find backend -name '__pycache__' -type d -exec rm -rf {} +
find backend -name '*.pyc' -delete

echo "==> Ensuring swap space and memory tuning"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 6G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
fi
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf

echo "==> Backend setup"
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cd ..

echo "==> Running database migrations"
cd backend
if [ -f run_migration.py ]; then
  python3 run_migration.py
fi
cd ..

echo "==> Frontend dependency audit and fix"
cd frontend
npm install
npm audit fix || true
cd ..

echo "==> Frontend build"
export NODE_OPTIONS=--max-old-space-size=2048
cd frontend
if ! npm run build; then
  echo '❌ Frontend build failed. Check for CSS/JS errors above!'
  exit 1
fi
cd ..

echo "==> Restarting services"
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart pos-backend
  sudo systemctl restart nginx
else
  echo "⚠️ systemctl not found; please restart pos-backend and nginx manually."
fi

echo "==> Health and endpoint checks"
sleep 3
if command -v curl >/dev/null 2>&1; then
  echo "Backend health:"
  curl -s http://127.0.0.1:8000/api/health || true
  echo

  echo "About-contact method check (expect POST/PUT support when latest backend is active):"
  curl -sk -i -X OPTIONS https://haappiibilling.in/api/platform/about-contact | sed -n '1,20p'
else
  echo "⚠️ curl not found; skip health checks."
fi

echo "==> All done! ✅"
