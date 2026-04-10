#!/bin/bash

set -e

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

echo "==> All done! ✅"
