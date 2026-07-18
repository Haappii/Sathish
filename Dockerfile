# ── Stage 1: Build React frontend ────────────────────────────
FROM node:22-slim AS frontend-builder

WORKDIR /build/frontend

# Install dependencies
COPY frontend/package*.json ./
RUN npm ci --silent

# Copy frontend source (vite.config reads ../.env and ../.env.production)
COPY frontend/ ./
COPY .env.production ../

# Build — Vite picks up .env.production automatically for production mode
RUN npm run build

# ── Stage 2: Python backend + frontend dist ───────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2 + Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libglib2.0-0 libsm6 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/app/ ./app/

# Copy built frontend to /frontend/dist (main.py resolves to this path)
# PROJECT_ROOT = parents[2] of /app/app/main.py = /
# FRONTEND_DIST_DIR = / / "frontend" / "dist" = /frontend/dist
COPY --from=frontend-builder /build/frontend/dist /frontend/dist

# Create runtime directories for uploads/images/logos/downloads
RUN mkdir -p \
    /app/uploads \
    /app/uploads/support \
    /app/uploads/platform \
    /app/uploads/team \
    /downloads \
    /frontend/src/assets/items \
    /frontend/src/assets/logo

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
