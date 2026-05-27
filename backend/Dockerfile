# ============================================
# VidSage Backend - Production Dockerfile
# FastAPI + Gunicorn + Celery Worker (shared image)
# ============================================

FROM python:3.11-slim AS base

# System deps: ffmpeg for audio processing, build tools for ML libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    gunicorn>=21.2.0 \
    bcrypt>=4.1.0

# Copy application code
COPY . .

# Create directories for persistent data
RUN mkdir -p /app/app/downloads /app/app/uploads /app/chroma_db /app/cookies

# Default: run FastAPI via Gunicorn using config file
# Override CMD for celery worker in docker-compose
CMD ["gunicorn", "app.main:app", "-c", "gunicorn_conf.py"]
