content = """#!/bin/bash
set -e

echo "🚀 VidSage starting on Render..."

mkdir -p /app/app/downloads /app/app/uploads /app/chroma_db

# Start Celery worker in background — don't kill container if it fails
echo "⏳ Starting Celery worker..."
celery -A app.celery_app worker -l info -P solo --max-tasks-per-child=20 2>&1 &
CELERY_PID=$!

# Give Celery a few seconds
sleep 3

# Check if Celery is still alive
if ! kill -0 $CELERY_PID 2>/dev/null; then
    echo "⚠️  Celery failed to start. Running without background worker."
    echo "   Transcription jobs will not work, but API will be functional."
fi

# Start FastAPI — THIS is the main process
echo "🌐 Starting FastAPI on port ${PORT:-10000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --timeout-keep-alive 120
"""
with open('backend/render-start.sh', 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
