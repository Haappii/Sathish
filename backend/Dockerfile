FROM python:3.11-slim

WORKDIR /app

# Install system deps needed by psycopg2 and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY portfolio/ /backend/portfolio/
COPY frontend_dist/ /frontend/dist/

# main.py resolves PROJECT_ROOT via parents[2] of /app/app/main.py = /
# so downloads, item-images, and shop-logos end up at these paths:
RUN mkdir -p \
    /app/uploads \
    /downloads \
    /frontend/src/assets/items \
    /frontend/src/assets/logo

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
