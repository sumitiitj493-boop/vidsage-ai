#!/bin/bash
# =============================================================
# VidSage — Render Free Tier Startup Script
# Runs both FastAPI + Celery Worker in a single container
# =============================================================

set -e

echo "🚀 VidSage starting on Render..."

# Create required directories
mkdir -p /app/app/downloads /app/app/uploads /app/chroma_db

# Start Celery worker in background (solo mode = single process, low memory)
echo "⏳ Starting Celery worker..."
celery -A app.celery_app worker -l info -P solo --max-tasks-per-child=20 &
CELERY_PID=$!

# Give Celery a few seconds to connect to Redis
sleep 3

# Start FastAPI with Uvicorn (single worker for free tier)
echo "🌐 Starting FastAPI..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --timeout-keep-alive 120 &
UVICORN_PID=$!

echo "✅ VidSage is running!"
echo "   FastAPI PID: $UVICORN_PID"
echo "   Celery PID: $CELERY_PID"
echo "   Port: ${PORT:-10000}"

# Wait for either process to exit
wait -n $CELERY_PID $UVICORN_PID

# If one dies, kill the other
echo "⚠️  A process exited, shutting down..."
kill $CELERY_PID $UVICORN_PID 2>/dev/null || true
exit 1