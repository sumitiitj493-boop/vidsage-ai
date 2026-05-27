content = """#!/bin/bash
echo "🚀 VidSage starting on Render..."
mkdir -p /app/app/downloads /app/app/uploads /app/chroma_db
echo "🌐 Starting FastAPI on port ${PORT:-10000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --timeout-keep-alive 300
"""
with open('backend/render-start.sh', 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
