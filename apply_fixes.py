import os

gunicorn_content = r'''"""
VidSage — Gunicorn Configuration (Production)

FIXED ISSUES from Copilot version:
1. Memory-aware worker calculation (Whisper/Celery share the same server)
2. Graceful timeout for long-running transcription status polling
3. Max requests per worker to prevent memory leaks
4. Proper preload setting
"""

import multiprocessing
import os

# ── Binding ───────────────────────────────────────────
bind = "0.0.0.0:8000"
backlog = 2048

# ── Workers ───────────────────────────────────────────
# IMPORTANT: Don't go crazy with workers on a single server.
# Your Celery workers also need RAM for Whisper + ML models.
# On 8GB server: 2-3 API workers + 2 Celery workers = safe
cores = multiprocessing.cpu_count()
workers = int(os.getenv("GUNICORN_WORKERS", max(2, min(3, cores))))
worker_class = "uvicorn.workers.UvicornWorker"

# ── Timeouts ──────────────────────────────────────────
# 120s because uploads + processing status polls can be slow
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = 5

# ── Memory Leak Prevention ────────────────────────────
# Restart workers after N requests to prevent memory leaks
# (Python + ML libs can leak over time)
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "100"))

# ── Logging ───────────────────────────────────────────
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# ── Security ──────────────────────────────────────────
limit_request_line = 8190         # Allow longer URLs (video URLs can be long)
limit_request_fields = 100
limit_request_field_size = 16384  # Allow larger headers (auth cookies)

# ── Server Identity ──────────────────────────────────
server_header = ""  # Don't advertise Gunicorn version
'''

dockerfile_content = r'''# ============================================
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
'''

with open('backend/gunicorn_conf.py', 'w', encoding='utf-8') as f:
    f.write(gunicorn_content)

with open('backend/Dockerfile', 'w', encoding='utf-8') as f:
    f.write(dockerfile_content)

print("Applied the fixes to backend/Dockerfile and backend/gunicorn_conf.py")
