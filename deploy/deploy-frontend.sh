#!/bin/bash
# Manual deployment script for Advance Orders menu fix
# Run this when SSH tunnel is available or server is back online

set -e

PROD_HOST="${1:-56.228.9.197}"
PROD_USER="${2:-ubuntu}"
SSH_KEY="${3:-~/.ssh/posapp.pem}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Deploying Advance Orders Menu Fix to Production         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Target Server: $PROD_USER@$PROD_HOST"
echo "SSH Key: $SSH_KEY"
echo ""

# Test SSH connection
echo "Testing SSH connection..."
if ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$PROD_USER@$PROD_HOST" "echo 'Connection OK'" 2>/dev/null; then
    echo "✓ Connection successful"
else
    echo "✗ Failed to connect to production server"
    echo "Please verify:"
    echo "  1. Server is online and reachable"
    echo "  2. SSH key path is correct: $SSH_KEY"
    echo "  3. SSH key has correct permissions (chmod 600)"
    exit 1
fi

echo ""
echo "Starting deployment..."
echo ""

# Run deployment commands on production server
ssh -i "$SSH_KEY" "$PROD_USER@$PROD_HOST" << 'DEPLOY_SCRIPT'
set -e

echo "Step 1/5: Navigating to frontend directory..."
cd ~/Sathish/frontend

echo "Step 2/5: Pulling latest changes from GitHub..."
git pull origin main

echo "Step 3/5: Building frontend with npm..."
npm install --production
npm run build

echo "Step 4/5: Verifying build output..."
if [ -f "dist/index.html" ]; then
    echo "  ✓ dist/index.html generated"
else
    echo "  ✗ Build failed - dist/index.html not found"
    exit 1
fi

echo "Step 5/5: Restarting nginx..."
sudo systemctl restart nginx
sleep 2

if sudo systemctl is-active --quiet nginx; then
    echo "  ✓ nginx restarted successfully"
else
    echo "  ✗ nginx failed to restart"
    exit 1
fi

echo ""
echo "✓ Deployment completed successfully!"
echo ""
echo "Verification:"
echo "  - Frontend: https://haappiibilling.in"
echo "  - Look for Advance Orders under Billing section"

DEPLOY_SCRIPT

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          ✓ Deployment Successful!                         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "The Advance Orders menu is now live!"
    echo "Visit: https://haappiibilling.in to verify"
else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          ✗ Deployment Failed                              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    exit 1
fi
