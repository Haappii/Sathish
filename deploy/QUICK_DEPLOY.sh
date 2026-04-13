#!/bin/bash
# Quick deployment - minimal version that can be run directly
# Usage: bash deploy.sh

set -e

echo "╔═══════════════════════════════════════════════════════╗"
echo "║  Advance Orders Menu - Quick Deployment Script       ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Step 1: Navigate to frontend
echo "→ Updating frontend..."
cd ~/Sathish/frontend

# Step 2: Get latest code
git pull origin main

# Step 3: Build
npm install --production && npm run build

# Step 4: Restart service
sudo systemctl restart nginx

# Step 5: Verify
sleep 2
if curl -s https://haappiibilling.in > /dev/null 2>&1; then
    echo ""
    echo "✓ SUCCESS! Advance Orders menu is now live"
    echo "  URL: https://haappiibilling.in"
else
    echo ""
    echo "⚠ Build complete, but website not responding yet (nginx warming up)"
fi

echo ""
