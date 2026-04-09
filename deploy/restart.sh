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
sleep 4

# Backend health (direct)
HEALTH="$(curl -s http://127.0.0.1:8000/api/health || echo 'UNREACHABLE')"
echo "    Backend : ${HEALTH}"

# Frontend via HTTPS (certbot manages SSL)
HTTP_STATUS="$(curl -sk -o /dev/null -w '%{http_code}' https://haappiibilling.in/ 2>/dev/null || echo '000')"
echo "    Site    : HTTPS ${HTTP_STATUS}"

echo ""
echo "Both services restarted successfully."
echo "  https://haappiibilling.in"
