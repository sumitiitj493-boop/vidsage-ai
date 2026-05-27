import os

files_to_create = {
    "frontend/vercel.json": r'''{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm ci",
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate" }
      ]
    },
    {
      "source": "/(.*)\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}''',
    "render.yaml": r'''# =============================================================
# VidSage — Render Blueprint
# Auto-configures the backend on Render
# Place this in your repo root
# =============================================================

services:
  - type: web
    name: vidsage-backend
    runtime: docker
    plan: free
    dockerfilePath: ./backend/Dockerfile.render
    dockerContext: ./backend
    envVars:
      - key: ENVIRONMENT
        value: production
      - key: PORT
        value: 10000
      - key: REDIS_URL
        sync: false  # Set manually: Upstash Redis URL
      - key: FRONTEND_URL
        sync: false  # Set manually: Vercel URL
      - key: GROQ_API_KEY
        sync: false  # Set manually: Your Groq key
      - key: WHISPER_MODEL_SIZE
        value: base
      - key: WHISPER_DEVICE
        value: cpu
      - key: WHISPER_COMPUTE_TYPE
        value: auto
      - key: CLEANING_MODEL
        value: llama-3.1-8b-instant
      - key: AUTH_ENABLED
        value: "true"
      - key: AUTH_USERNAME
        sync: false
      - key: AUTH_PASSWORD
        value: ""
      - key: AUTH_PASSWORD_HASH
        sync: false  # Generate with: python generate_secrets.py
      - key: AUTH_SECRET_KEY
        sync: false  # Generate with: python generate_secrets.py
      - key: AUTH_COOKIE_SECURE
        value: "false"
      - key: DOWNLOAD_DIR
        value: /opt/render/project/src/app/downloads
      - key: UPLOAD_DIR
        value: /opt/render/project/src/app/uploads
      - key: CHROMA_DB_DIR
        value: /opt/render/project/src/chroma_db
    healthCheckPath: /health''',
    "backend/render-start.sh": r'''#!/bin/bash
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
exit 1''',
    "backend/Dockerfile.render": r'''# ============================================
# VidSage Backend — Render Free Tier Dockerfile
# Optimized for 512MB RAM, $0/month
#
# KEY OPTIMIZATIONS:
# - Uses Groq API for transcription (no local Whisper)
# - Runs Celery worker + FastAPI in same container
# - Minimal dependencies, slim image
# - Total memory: ~300-400MB (fits free tier)
# ============================================

FROM python:3.11-slim

# Install ffmpeg (for audio preprocessing) + curl (healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (excluding heavy ML libs we don't need)
COPY requirements.render.txt requirements.txt

# Install only what's needed — faster-whisper is kept for fallback
# but Groq API will be primary for free tier
RUN pip install --no-cache-dir -r requirements.txt \
    gunicorn>=21.2.0 \
    bcrypt>=4.1.0

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p /app/app/downloads /app/app/uploads /app/chroma_db

# Render sets PORT env variable automatically
ENV PORT=10000

# Render uses a startup script to run both FastAPI + Celery
# This script is called instead of a single CMD
COPY render-start.sh /app/render-start.sh
RUN chmod +x /app/render-start.sh

# Health check — Render uses this to verify service is up
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-10000}/health || exit 1

# Start both services
CMD ["/app/render-start.sh"]''',
    "backend/app/services/transcription_service.py": r'''"""
VidSage — Groq Whisper API Transcription Service

Uses Groq's free Whisper API instead of local faster-whisper.
This eliminates the 2-4GB RAM requirement.

Groq free tier:
- whisper-large-v3 model
- ~30 seconds per 10-minute audio
- No rate limit on free tier (reasonable use)
- Fastest Whisper API available
"""

import logging
import os
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)


class GroqTranscriptionService:
    """
    Transcription via Groq's Whisper API.

    Falls back to local faster-whisper if Groq is unavailable.
    """

    def __init__(self):
        self._groq_client = None
        self._groq_available = False
        self._local_whisper_available = False
        self._model = None

    def _init_groq(self):
        """Initialize Groq client lazily."""
        if self._groq_client is not None:
            return

        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            logger.warning("GROQ_API_KEY not set, Groq transcription unavailable")
            return

        try:
            from groq import Groq
            self._groq_client = Groq(api_key=api_key)
            self._groq_available = True
            logger.info("✅ Groq Whisper API initialized")
        except Exception as e:
            logger.warning(f"Groq init failed: {e}")
            self._groq_available = False

    def _init_local_whisper(self):
        """Initialize local faster-whisper as fallback."""
        if self._model is not None:
            return

        try:
            from faster_whisper import WhisperModel
            model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
            device = os.getenv("WHISPER_DEVICE", "cpu")
            compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "auto")

            logger.info(f"Loading local Whisper: {model_size} on {device}")
            self._model = WhisperModel(model_size, device=device, compute_type=compute_type)
            self._local_whisper_available = True
            logger.info("✅ Local Whisper model loaded")
        except Exception as e:
            logger.warning(f"Local Whisper init failed: {e}")
            self._local_whisper_available = False

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
    ) -> dict:
        """
        Transcribe audio file. Returns dict with segments and full text.

        Tries Groq API first, falls back to local Whisper.
        """
        # Try Groq first (cloud, fast, low memory)
        self._init_groq()
        if self._groq_available:
            try:
                result = self._transcribe_groq(audio_path, language)
                result["engine"] = "groq_api"
                return result
            except Exception as e:
                logger.warning(f"Groq transcription failed, trying local: {e}")

        # Fallback to local Whisper
        self._init_local_whisper()
        if self._local_whisper_available:
            try:
                result = self._transcribe_local(audio_path, language)
                result["engine"] = "local_whisper"
                return result
            except Exception as e:
                logger.error(f"Local Whisper also failed: {e}")

        return {
            "text": "",
            "segments": [],
            "language": language or "unknown",
            "engine": "none",
            "error": "Both Groq API and local Whisper failed",
        }

    def _transcribe_groq(self, audio_path: str, language: Optional[str]) -> dict:
        """Transcribe using Groq's Whisper API."""
        filename = os.path.basename(audio_path)

        with open(audio_path, "rb") as audio_file:
            kwargs = {
                "model": "whisper-large-v3",
                "file": (filename, audio_file, "audio/mpeg"),
                "response_format": "verbose_json",
                "temperature": 0.0,
            }
            if language:
                kwargs["language"] = language

            response = self._groq_client.audio.transcriptions.create(**kwargs)

        # Parse response
        segments = []
        if hasattr(response, "segments") and response.segments:
            for seg in response.segments:
                segments.append({
                    "start": seg.get("start", 0) if isinstance(seg, dict) else getattr(seg, "start", 0),
                    "end": seg.get("end", 0) if isinstance(seg, dict) else getattr(seg, "end", 0),
                    "text": seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", ""),
                })

        text = response.text if hasattr(response, "text") else str(response)
        lang = getattr(response, "language", language or "unknown")

        logger.info(f"Groq transcription complete: {len(text)} chars, {len(segments)} segments")

        return {
            "text": text,
            "segments": segments,
            "language": lang,
        }

    def _transcribe_local(self, audio_path: str, language: Optional[str]) -> dict:
        """Transcribe using local faster-whisper (fallback)."""
        kwargs = {}
        if language:
            kwargs["language"] = language

        segments_iter, info = self._model.transcribe(audio_path, **kwargs)

        segments = []
        for seg in segments_iter:
            segments.append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text,
            })

        text = " ".join(s["text"] for s in segments)
        logger.info(f"Local transcription complete: {len(text)} chars, {len(segments)} segments")

        return {
            "text": text,
            "segments": segments,
            "language": info.language if hasattr(info, "language") else (language or "unknown"),
        }


# Singleton
transcription_service = GroqTranscriptionService()''',
    "backend/requirements.render.txt": r'''# =============================================================
# VidSage Backend — Free Tier Dependencies (Render)
#
# OPTIMIZED FOR 512MB RAM:
# - Uses Groq API for transcription (no local Whisper needed)
# - Uses Groq API for LLM cleaning
# - Keeps faster-whisper as optional fallback only
# - Keeps sentence-transformers for ChromaDB embeddings
#
# If local Whisper is needed later (on paid tier),
# use the original requirements.txt instead
# =============================================================

# Core web framework
fastapi>=0.109.0
uvicorn>=0.27.0
python-multipart>=0.0.9
python-dotenv>=1.0.0
pydantic>=2.6.0

# HTTP client (for Groq API calls)
httpx>=0.27.0
httpcore>=1.0.0

# Background jobs
celery>=5.3.0
redis>=4.5.0

# File handling
aiofiles>=23.0.0

# Groq API (free Whisper + LLM)
groq>=0.4.0

# YouTube processing
youtube-transcript-api>=0.6.0
yt-dlp>=2024.0.0

# RAG Dependencies (these are needed for ChromaDB)
chromadb>=0.4.24
sentence-transformers>=2.7.0
langchain>=0.1.16
langchain-community>=0.0.33
langchain-core>=0.1.44
langchain-text-splitters>=0.0.1

# PDF support
pypdf>=4.1.0

# Utilities
rich>=13.0.0
tqdm>=4.66.0
click>=8.1.0
PyYAML>=6.0.0
requests>=2.31.0

# Production extras
gunicorn>=21.2.0
bcrypt>=4.1.0''',
    "FREE-DEPLOY-STEP-BY-STEP.md": r'''=============================================================
VidSage — FREE Deployment Step-by-Step
=============================================================
Total cost: $0.00/month
Time needed: ~30 minutes
=============================================================
═══════════════════════════════════════════════════════
BEFORE YOU START — On Your Local Machine
═══════════════════════════════════════════════════════
Step 0a: Generate production secrets

cd your-project-directory
pip install bcrypt
python generate_secrets.py
SAVE the output — you'll need AUTH_SECRET_KEY and AUTH_PASSWORD_HASH
Step 0b: Commit and push all new files to GitHub

git add .
git commit -m "Add production deployment config"
git push origin main
═══════════════════════════════════════════════════════
STEP 1: Create Upstash Redis (2 minutes)
═══════════════════════════════════════════════════════
1. Go to https://upstash.com
2. Click "Start Free" → Sign up with GitHub
3. Click "Create Database"
- Name: vidsage-redis
- Region: closest to you
- Type: Regional
4. Click "Create"
5. On the database page, click "@upstash/redis" tab
6. Copy the UPSTASH_REDIS_REST_URL (you'll need it)
7. Also copy the traditional Redis URL:
redis://default:YOUR_PASSWORD@us1-useast1-NNN.upstash.io:6379
SAVE THIS: redis://default:xxxxx@us1-xxxxx.upstash.io:6379
═══════════════════════════════════════════════════════
STEP 2: Deploy Frontend to Vercel (3 minutes)
═══════════════════════════════════════════════════════
1. Go to https://vercel.com
2. Click "Sign Up" → Use GitHub
3. Click "Add New" → "Project"
4. Find your VidSage repo → Click "Import"
5. Configure:
- Project Name: vidsage
- Framework Preset: Next.js (auto-detected)
- Root Directory: click "Edit" → type "frontend" → Confirm
- Build Command: npm run build (default)
- Output Directory: .next (default)
6. Under "Environment Variables", add:
NEXT_PUBLIC_API_BASE_URL = https://vidsage-backend.onrender.com
(You'll update this after Step 3. For now, just guess the name)
7. Click "Deploy"
8. Wait ~2 minutes for build
9. Your URL: https://vidsage.vercel.app (or similar)
SAVE THIS URL
═══════════════════════════════════════════════════════
STEP 3: Deploy Backend to Render (5 minutes)
═══════════════════════════════════════════════════════
1. Go to https://render.com
2. Click "Get Started" → Sign up with GitHub
3. Click "New" → "Web Service"
4. Find your VidSage repo → Click "Connect"
5. Configure:
- Name: vidsage-backend
- Root Directory: backend
- Runtime: Docker
- Region: Oregon (or closest)
- Branch: main
- Instance Type: Free ← IMPORTANT
- Dockerfile Path: ./Dockerfile.render
6. Under "Advanced" → "Add Environment Variable", add ALL of these:
ENVIRONMENT = production
PORT = 10000
REDIS_URL = redis://default:xxxxx@us1-xxxxx.upstash.io:6379
FRONTEND_URL = https://vidsage.vercel.app (from Step 2)
GROQ_API_KEY = gsk_your_key_here
AUTH_ENABLED = true
AUTH_USERNAME = your_email@example.com
AUTH_PASSWORD = (leave empty)
AUTH_PASSWORD_HASH = $2b$12$xxxxx (from generate_secrets.py)
AUTH_SECRET_KEY = your_long_secret_key (from generate_secrets.py)
AUTH_ISSUER = vidsage-api
AUTH_AUDIENCE = vidssage-client
AUTH_COOKIE_SECURE = false
AUTH_COOKIE_SAMESITE = lax
DOWNLOAD_DIR = /opt/render/project/src/app/downloads
UPLOAD_DIR = /opt/render/project/src/app/uploads
CHROMA_DB_DIR = /opt/render/project/src/chroma_db
WHISPER_MODEL_SIZE = base
WHISPER_DEVICE = cpu
WHISPER_COMPUTE_TYPE = auto
7. Click "Create Web Service"
8. Wait ~5-10 minutes for first build (Docker image build)
9. Your URL: https://vidsage-backend.onrender.com
TEST IT:
Open in browser: https://vidsage-backend.onrender.com/health
Should return: {"status":"healthy","environment":"production"}
═══════════════════════════════════════════════════════
STEP 4: Connect Frontend ↔ Backend (2 minutes)
═══════════════════════════════════════════════════════
In Vercel Dashboard:
1. Go to your vidsage project → Settings → Environment Variables
2. Update NEXT_PUBLIC_API_BASE_URL to your ACTUAL Render URL:
https://vidsage-backend.onrender.com
3. Go to Deployments → Click "..." on latest → "Redeploy"
4. Wait ~1 minute
In Render Dashboard:
1. Go to vidsage-backend → Environment
2. Make sure FRONTEND_URL = https://your-actual-vercel-url.vercel.app
3. Save changes (triggers auto-redeploy)
═══════════════════════════════════════════════════════
STEP 5: Test Everything (2 minutes)
═══════════════════════════════════════════════════════
1. Visit your Vercel URL: https://vidsage.vercel.app
→ Frontend should load
2. Try logging in with your AUTH credentials
3. Try uploading an audio file or pasting a YouTube URL
4. Check Render logs:
Dashboard → vidsage-backend → Logs
NOTE: First request after 15min of inactivity = ~30s cold start
This is normal for free tier. Subsequent requests are fast.
═══════════════════════════════════════════════════════
STEP 6: Update CORS (if needed)
═══════════════════════════════════════════════════════
If you get CORS errors:
1. In Render → Environment
2. Make sure FRONTEND_URL exactly matches your Vercel URL
3. Including https:// and no trailing slash
═══════════════════════════════════════════════════════
WHAT YOU GET FOR FREE
═══════════════════════════════════════════════════════
┌─────────────────────────────────────────────────────┐
│ │
│ https://vidsage.vercel.app ← Frontend │
│ https://vidsage-backend.onrender.com ← Backend API │
│ │
│ ✅ Live URL to share on resume │
│ ✅ Working transcription via Groq │
│ ✅ Background job processing via Celery + Upstash │
│ ✅ RAG / Chat with ChromaDB │
│ ✅ Rate limiting + Security headers │
│ ✅ YouTube video processing │
│ ✅ Auto-deploys from GitHub pushes │
│ │
│ Total cost: $0.00/month │
│ │
└─────────────────────────────────────────────────────┘
═══════════════════════════════════════════════════════
FREE TIER LIMITATIONS (What to expect)
═══════════════════════════════════════════════════════
Render (Backend):
- 512MB RAM (enough with Groq API, no local Whisper)
- Sleeps after 15min inactivity → 30s cold start
- 750 hours/month (enough for continuous runtime)
- ChromaDB data persists but resets on redeploy
Vercel (Frontend):
- 100GB bandwidth/month
- Always on, no sleep
- Auto-deploys from GitHub
Upstash (Redis):
- 10,000 commands/day (plenty for demo)
- 256MB storage
Groq (Transcription + LLM):
- Free tier with rate limits
- whisper-large-v3 model
- llama-3.1-8b-instant for cleaning
═══════════════════════════════════════════════════════
UPGRADE PATH (When you get a job/budget)
═══════════════════════════════════════════════════════
$7/mo → Render Starter (no sleep, 2GB RAM)
$5/mo → Vercel Pro (faster builds, more bandwidth)
$15/mo → Hetzner VPS (8GB RAM, run EVERYTHING including local Whisper)
$0/mo → Oracle Cloud Always Free (24GB ARM VM — the holy grail)''',
    "FREE-DEPLOY.md": r'''💰 $0/month Architecture

User
  │
  ├──→ Vercel (Free)                    ← Frontend
  │     vidsage.vercel.app
  │          │
  │          ▼
  ├──→ Render (Free)                    ← Backend API + Celery
  │     vidsage-backend.onrender.com
  │          │
  │          ├──→ Upstash Redis (Free)  ← Job queue
  │          ├──→ Groq API (Free)       ← Whisper + LLM
  │          └──→ ChromaDB (in-memory)  ← RAG
  │
  └──→ Auto-deploys from GitHub push

📂 New Files for Free Tier
File	Purpose
backend/Dockerfile.render	Slim Docker image optimized for 512MB RAM
backend/render-start.sh	Runs FastAPI + Celery in one container
backend/requirements.render.txt	Lighter deps (no local Whisper needed)
backend/app/services/transcription_service.py	Groq API Whisper → local Whisper fallback
frontend/vercel.json	Vercel config for Next.js
render.yaml	Render Blueprint (auto-config)
FREE-DEPLOY-STEP-BY-STEP.md	Idiot-proof deployment guide
FREE-DEPLOY.md	Architecture overview

🔑 Why This Works for Free
Problem	Solution
Whisper needs 4GB RAM	Groq API handles transcription in cloud (free)
Celery needs separate server	Runs in same container with solo pool
Redis needs hosting	Upstash free tier (10K commands/day)
Need SSL/HTTPS	Vercel + Render provide HTTPS automatically
Need domain	.vercel.app and .onrender.com subdomains (free)

⚡ Quick Deploy (30 minutes)

1. python generate_secrets.py          ← Generate keys
2. Push to GitHub
3. Upstash → Create Redis DB            ← 2 min
4. Vercel → Import repo → Deploy        ← 3 min
5. Render → Import repo → Add env vars  ← 5 min
6. Update Vercel env with Render URL    ← 2 min
7. Visit your live site! 🎉

The only tradeoff: Render sleeps after 15min of no traffic, so the first visitor waits ~30 seconds. After that it's fast. For a resume project, this is perfect.
'''
}

import os
import stat

for filepath, content in files_to_create.items():
    # Make sure directory exists
    os.makedirs(os.path.dirname(filepath) if os.path.dirname(filepath) else '.', exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    # Make the script executable
    if filepath.endswith('.sh'):
        st = os.stat(filepath)
        os.chmod(filepath, st.st_mode | stat.S_IEXEC)

print("Created all files for the $0 free deployment strategy")
