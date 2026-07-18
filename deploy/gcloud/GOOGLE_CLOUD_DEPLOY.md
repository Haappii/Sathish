# Google Cloud Deployment Guide — Shop Billing App

## Architecture

```
User → Firebase Hosting (Frontend/React)
         ↓
     Cloud Run (FastAPI Backend)
         ↓
     Cloud SQL (PostgreSQL)
```

**Estimated cost: $0–8/month** (Cloud Run + Firebase free tier; only Cloud SQL has a fixed cost ~$7/mo)

---

## Prerequisites

1. Install [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Install [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
3. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Step 1 — Create GCP Project

```bash
# Login to Google Cloud
gcloud auth login

# Create a new project (replace with your preferred project ID)
gcloud projects create shop-billing-prod --name="Shop Billing App"

# Set it as the active project
gcloud config set project shop-billing-prod

# Enable billing on the project (required for Cloud Run + Cloud SQL)
# Do this in browser: https://console.cloud.google.com/billing
```

---

## Step 2 — Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com
```

---

## Step 3 — Create Cloud SQL (PostgreSQL)

```bash
# Create PostgreSQL instance (smallest/cheapest: db-f1-micro)
gcloud sql instances create shop-billing-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-south1 \
  --storage-size=10GB \
  --storage-type=HDD

# Create the database
gcloud sql databases create shop_billing --instance=shop-billing-db

# Set the postgres user password (remember this!)
gcloud sql users set-password postgres \
  --instance=shop-billing-db \
  --password=YOUR_STRONG_PASSWORD
```

Get the Cloud SQL connection name (you'll need this):
```bash
gcloud sql instances describe shop-billing-db --format="value(connectionName)"
# Output example: shop-billing-prod:asia-south1:shop-billing-db
```

---

## Step 4 — Store Secrets in Secret Manager

```bash
# Store DATABASE_URL (use Cloud SQL connection via socket for Cloud Run)
echo -n "postgresql+psycopg2://postgres:YOUR_STRONG_PASSWORD@/shop_billing?host=/cloudsql/shop-billing-prod:asia-south1:shop-billing-db" | \
  gcloud secrets create DATABASE_URL --data-file=-

# Store JWT secret
echo -n "your-very-long-random-jwt-secret-key-here" | \
  gcloud secrets create JWT_SECRET --data-file=-
```

---

## Step 5 — Build and Deploy Backend to Cloud Run

### Option A: Manual deploy (first time)

```bash
# From the shop-billing-app/ directory
cd backend

# Build Docker image
docker build -t gcr.io/shop-billing-prod/shop-billing-backend:latest .

# Authenticate Docker with GCR
gcloud auth configure-docker

# Push image
docker push gcr.io/shop-billing-prod/shop-billing-backend:latest

# Deploy to Cloud Run
gcloud run deploy shop-billing-backend \
  --image=gcr.io/shop-billing-prod/shop-billing-backend:latest \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --add-cloudsql-instances=shop-billing-prod:asia-south1:shop-billing-db \
  --set-env-vars=APP_ENV=production \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest"
```

You'll get a URL like: `https://shop-billing-backend-xxxx-el.a.run.app`

### Option B: Automatic CI/CD via Cloud Build (after first deploy)

```bash
# Connect your GitHub repo in GCP Console → Cloud Build → Triggers
# Then every git push auto-deploys using deploy/gcloud/cloudbuild.yaml
```

---

## Step 6 — Initialize Database

After first deploy, run migrations once:

```bash
# Connect to Cloud SQL from your local machine
gcloud sql connect shop-billing-db --user=postgres --database=shop_billing

# Or run the existing init script via Cloud Run job
gcloud run jobs create init-db \
  --image=gcr.io/shop-billing-prod/shop-billing-backend:latest \
  --region=asia-south1 \
  --add-cloudsql-instances=shop-billing-prod:asia-south1:shop-billing-db \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
  --command="python" \
  --args="deploy/init_db.py"

gcloud run jobs execute init-db --region=asia-south1
```

---

## Step 7 — Deploy Frontend to Firebase Hosting

```bash
# From the shop-billing-app/frontend directory
cd frontend

# Login to Firebase
firebase login

# Init Firebase (select your GCP project when prompted)
firebase init hosting
# Choose: Use existing project → shop-billing-prod
# Public directory: dist
# Single-page app: Yes
# Don't overwrite index.html: No

# Set the backend URL for production build
echo "VITE_API_BASE=https://shop-billing-backend-xxxx-el.a.run.app" > .env.production

# Build the frontend
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

Your frontend will be live at: `https://shop-billing-prod.web.app`

---

## Step 8 — Update CORS on Backend

After getting your Firebase URL, update `ALLOWED_ORIGINS` in Cloud Run:

```bash
gcloud run services update shop-billing-backend \
  --region=asia-south1 \
  --update-env-vars="ALLOWED_ORIGINS=https://shop-billing-prod.web.app"
```

---

## Cost Summary

| Service | Spec | Est. Cost/Month |
|---|---|---|
| Cloud Run | 512MB, scales to 0 | $0–2 |
| Cloud SQL | db-f1-micro, 10GB HDD | ~$7 |
| Firebase Hosting | 10GB bandwidth | Free |
| Container Registry | Image storage | ~$0.10 |
| **Total** | | **~$7–10/month** |

---

## Important Notes

### File Uploads (uploads/ directory)
Cloud Run is **stateless** — files written to disk are lost on restart.
For production, uploaded files should be stored in **Google Cloud Storage**:
1. Create a bucket: `gcloud storage buckets create gs://shop-billing-uploads`
2. Update file upload routes to use the `google-cloud-storage` Python library

For now, uploads work but will reset if the container restarts.

### Custom Domain
```bash
# Add custom domain to Firebase Hosting
firebase hosting:channel:deploy production
# Then in Firebase Console → Hosting → Add custom domain
```
