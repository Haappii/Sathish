#!/bin/bash
# ============================================================
# Google Cloud — Full Setup Script for haappiibilling.in
# Run this once from your local machine (bash/WSL/Cloud Shell)
# ============================================================

set -e  # Exit on any error

# ── CONFIGURATION ────────────────────────────────────────────
PROJECT_ID="haappiibilling"           # GCP project ID (must be globally unique)
REGION="asia-south1"                  # Mumbai — closest to India
DB_INSTANCE="shop-billing-db"
DB_NAME="shop_billing"
DB_USER="postgres"
BACKEND_SERVICE="shop-billing-backend"
DOMAIN="haappiibilling.in"
API_DOMAIN="api.haappiibilling.in"
# ─────────────────────────────────────────────────────────────

echo "============================================"
echo " Shop Billing App — Google Cloud Setup"
echo " Domain: $DOMAIN"
echo " Project: $PROJECT_ID"
echo "============================================"
echo ""

# ── STEP 1: Create & configure GCP project ──────────────────
echo "[1/9] Creating GCP project..."
gcloud projects create $PROJECT_ID --name="Haappii Billing" 2>/dev/null || echo "Project already exists, continuing..."
gcloud config set project $PROJECT_ID

echo ""
echo "⚠️  ACTION REQUIRED: Enable billing for project '$PROJECT_ID'"
echo "   Open: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
echo "   Link your billing account, then press ENTER to continue."
read -p ""

# ── STEP 2: Enable APIs ──────────────────────────────────────
echo "[2/9] Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  compute.googleapis.com

echo "✓ APIs enabled"

# ── STEP 3: Create Cloud SQL (PostgreSQL) ────────────────────
echo ""
echo "[3/9] Creating Cloud SQL PostgreSQL instance (this takes 3-5 minutes)..."
gcloud sql instances create $DB_INSTANCE \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-size=10GB \
  --storage-type=HDD \
  --no-backup \
  2>/dev/null || echo "DB instance already exists, continuing..."

gcloud sql databases create $DB_NAME \
  --instance=$DB_INSTANCE \
  2>/dev/null || echo "Database already exists, continuing..."

echo ""
read -s -p "Enter a strong password for PostgreSQL (you'll need this): " DB_PASSWORD
echo ""

gcloud sql users set-password $DB_USER \
  --instance=$DB_INSTANCE \
  --password="$DB_PASSWORD"

# Get the Cloud SQL connection name
CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE --format="value(connectionName)")
echo "✓ Cloud SQL created: $CONNECTION_NAME"

# ── STEP 4: Store secrets in Secret Manager ──────────────────
echo ""
echo "[4/9] Storing secrets in Secret Manager..."

DB_URL="postgresql+psycopg2://$DB_USER:$DB_PASSWORD@/shop_billing?host=/cloudsql/$CONNECTION_NAME"

echo -n "$DB_URL" | gcloud secrets create DATABASE_URL --data-file=- 2>/dev/null || \
  echo -n "$DB_URL" | gcloud secrets versions add DATABASE_URL --data-file=-

echo ""
read -s -p "Enter your JWT secret key (random string, min 32 chars): " JWT_SECRET
echo ""

echo -n "$JWT_SECRET" | gcloud secrets create JWT_SECRET --data-file=- 2>/dev/null || \
  echo -n "$JWT_SECRET" | gcloud secrets versions add JWT_SECRET --data-file=-

echo "✓ Secrets stored"

# ── STEP 5: Build Docker image ───────────────────────────────
echo ""
echo "[5/9] Building Docker image..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

gcloud auth configure-docker --quiet

docker build -t gcr.io/$PROJECT_ID/$BACKEND_SERVICE:latest "$APP_ROOT/backend"
docker push gcr.io/$PROJECT_ID/$BACKEND_SERVICE:latest

echo "✓ Docker image pushed to gcr.io/$PROJECT_ID/$BACKEND_SERVICE:latest"

# ── STEP 6: Deploy backend to Cloud Run ─────────────────────
echo ""
echo "[6/9] Deploying backend to Cloud Run..."

# Grant Cloud Run the permission to access secrets
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

gcloud run deploy $BACKEND_SERVICE \
  --image=gcr.io/$PROJECT_ID/$BACKEND_SERVICE:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --add-cloudsql-instances=$CONNECTION_NAME \
  --set-env-vars="APP_ENV=production,ALLOWED_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,JWT_ALGORITHM=HS256,ACCESS_TOKEN_EXPIRE_MINUTES=1440" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest"

CLOUD_RUN_URL=$(gcloud run services describe $BACKEND_SERVICE --region=$REGION --format="value(status.url)")
echo "✓ Backend live at: $CLOUD_RUN_URL"

# ── STEP 7: Map api.haappiibilling.in to Cloud Run ──────────
echo ""
echo "[7/9] Mapping api.$DOMAIN to Cloud Run..."
gcloud run domain-mappings create \
  --service=$BACKEND_SERVICE \
  --domain=$API_DOMAIN \
  --region=$REGION \
  2>/dev/null || echo "Domain mapping may already exist."

echo ""
echo "✓ Domain mapping created. Run the command below to get DNS records:"
echo "  gcloud run domain-mappings describe --domain=$API_DOMAIN --region=$REGION"
echo ""
echo "  Add those records to GoDaddy DNS for $API_DOMAIN"

# ── STEP 8: Initialize database ─────────────────────────────
echo ""
echo "[8/9] Initializing database (running migrations)..."
echo ""
echo "⚠️  Run this command to initialize the database schema:"
echo ""
echo "  gcloud run jobs create init-db \\"
echo "    --image=gcr.io/$PROJECT_ID/$BACKEND_SERVICE:latest \\"
echo "    --region=$REGION \\"
echo "    --add-cloudsql-instances=$CONNECTION_NAME \\"
echo "    --set-secrets='DATABASE_URL=DATABASE_URL:latest' \\"
echo "    --command=python \\"
echo "    --args='-c,from app.db import engine, Base; Base.metadata.create_all(engine)'"
echo ""
echo "  gcloud run jobs execute init-db --region=$REGION --wait"

# ── STEP 9: Summary ──────────────────────────────────────────
echo ""
echo "============================================"
echo " ✓ BACKEND SETUP COMPLETE"
echo "============================================"
echo ""
echo " Backend URL : $CLOUD_RUN_URL"
echo " API Domain  : https://$API_DOMAIN  (after DNS propagation)"
echo ""
echo " NEXT: Deploy the frontend"
echo " See deploy/gcloud/DOMAIN_SETUP.md → Step 3 (Firebase Hosting)"
echo ""
