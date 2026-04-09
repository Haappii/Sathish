#!/usr/bin/env bash
# Restart backend (FastAPI) and frontend (nginx) services
# Usage: bash deploy/restart.sh

set -euo pipefail

echo "==> Restarting backend (pos-backend)..."
sudo systemctl restart pos-backend
echo "    Done."

echo "==> Restarting frontend (nginx)..."
sudo systemctl restart nginx
echo "    Done."

echo "==> Health check..."
sleep 2
HEALTH="$(curl -s http://127.0.0.1:8000/api/health || echo 'UNREACHABLE')"
echo "    Backend : ${HEALTH}"

HTTP_STATUS="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ || echo '000')"
echo "    Frontend: HTTP ${HTTP_STATUS}"

echo ""
echo "Both services restarted successfully."
