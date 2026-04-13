#!/usr/bin/env bash
# Run all pending DB migrations in order.
# Safe to re-run: uses IF NOT EXISTS throughout (see note below for raw_material).
#
# Usage (from server):
#   cd /home/ubuntu/Sathish
#   bash deploy/run_migrations.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/backend/migrations"

# Load DB connection from config
CONFIG_EXAMPLE="${ROOT_DIR}/config.example.txt"
CONFIG_FILE="${ROOT_DIR}/config.txt"

if [[ -f "${CONFIG_EXAMPLE}" ]]; then
  set -a; source <(sed 's/\r$//' "${CONFIG_EXAMPLE}"); set +a
fi
if [[ -f "${CONFIG_FILE}" ]]; then
  set -a; source <(sed 's/\r$//' "${CONFIG_FILE}"); set +a
fi

DATABASE_URL="${DATABASE_URL:-postgresql://shopuser:postgres@localhost:5432/shop_billing}"

# Extract psql connection args from DATABASE_URL
# Format: postgresql://user:pass@host:port/dbname
DB_USER=$(echo "${DATABASE_URL}" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "${DATABASE_URL}" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "${DATABASE_URL}" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "${DATABASE_URL}" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "${DATABASE_URL}" | sed -E 's|.*/([^?]+)|\1|')

export PGPASSWORD="${DB_PASS}"
PSQL="psql -U ${DB_USER} -h ${DB_HOST} -p ${DB_PORT} -d ${DB_NAME}"

run_migration() {
  local file="$1"
  local name
  name="$(basename "${file}")"
  echo "==> Running ${name} ..."
  ${PSQL} -f "${file}"
  echo "    Done."
}

echo "Running migrations against: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo

# Run migrations in chronological order
run_migration "${MIGRATIONS_DIR}/20260204_add_payment_mode.sql"
run_migration "${MIGRATIONS_DIR}/20260204_add_cost_mrp.sql"
run_migration "${MIGRATIONS_DIR}/20260205_add_branch_expenses.sql"
run_migration "${MIGRATIONS_DIR}/20260205_add_day_month_close.sql"
run_migration "${MIGRATIONS_DIR}/20260205_add_date_wise_stock.sql"
run_migration "${MIGRATIONS_DIR}/20260206_add_shop_id.sql"
run_migration "${MIGRATIONS_DIR}/20260207_add_onboard_codes.sql"
run_migration "${MIGRATIONS_DIR}/20260207_add_item_images.sql"
run_migration "${MIGRATIONS_DIR}/20260213_online_orders_security_sync.sql"
run_migration "${MIGRATIONS_DIR}/20260213_add_employee_management.sql"
run_migration "${MIGRATIONS_DIR}/20260218_add_demo_expiry.sql"
run_migration "${MIGRATIONS_DIR}/20260218_add_table_qr_sessions.sql"

# This one uses plain ADD COLUMN (no IF NOT EXISTS) — wrap in DO block to skip if already exists
echo "==> Running 20260218_add_item_raw_material.sql (idempotent wrap) ..."
${PSQL} <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='items' AND column_name='is_raw_material'
  ) THEN
    ALTER TABLE items ADD COLUMN is_raw_material BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END
$$;
SQL
echo "    Done."

run_migration "${MIGRATIONS_DIR}/20260301_add_gst_reporting_fields.sql"
run_migration "${MIGRATIONS_DIR}/20260302_branch_item_prices.sql"
run_migration "${MIGRATIONS_DIR}/20260303_branch_categories_items.sql"
run_migration "${MIGRATIONS_DIR}/20260405_add_branch_service_charge.sql"
run_migration "${MIGRATIONS_DIR}/20260405_add_fssai_number.sql"
run_migration "${MIGRATIONS_DIR}/20260405_reservation_payment.sql"
run_migration "${MIGRATIONS_DIR}/20260405_reservation_upi.sql"
run_migration "${MIGRATIONS_DIR}/20260406_add_head_office_branch_id.sql"
run_migration "${MIGRATIONS_DIR}/20260406_add_table_categories.sql"
run_migration "${MIGRATIONS_DIR}/20260406_add_user_session_tracking.sql"
run_migration "${MIGRATIONS_DIR}/20260406_fix_table_name_unique_constraint.sql"
run_migration "${MIGRATIONS_DIR}/20260409_add_shop_limits.sql"
run_migration "${MIGRATIONS_DIR}/20260409_branch_feedback_qr.sql"
run_migration "${MIGRATIONS_DIR}/20260409_feedback.sql"
run_migration "${MIGRATIONS_DIR}/20260409_gift_card_email.sql"
run_migration "${MIGRATIONS_DIR}/20260410_branch_print_logo.sql"
run_migration "${MIGRATIONS_DIR}/20260410_feedback_schema_sync.sql"
run_migration "${MIGRATIONS_DIR}/20260411_add_items_sold_by_weight.sql"

echo
echo "All migrations applied successfully."
