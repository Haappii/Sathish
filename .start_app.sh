#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper to run the app from the repo root on EC2.
# Example:
#   PUBLIC_HOST=13.60.186.234 FRONTEND_MODE=preview ./\.start_app.sh

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${DIR}/start_app.sh"

