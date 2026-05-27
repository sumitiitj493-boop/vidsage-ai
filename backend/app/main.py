"""
VidSage — Production main.py

Drops in as a replacement for your existing backend/app/main.py.
Adds:
- Rate limiting middleware
- Security headers middleware
- Request logging middleware
- Graceful shutdown
- Proper logging configuration
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import require_auth
from app.config import settings
from app.api.routes import auth, video, transcription, upload, clean, text_input, chat, pdf, notes

# ── Logging Configuration ────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# ── Lifespan (replaces deprecated @app.on_event) ─────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────
    logger.info("🚀 VidSage API starting...")
    logger.info(f"   Environment: {settings.ENVIRONMENT}")
    logger.info(f"   Auth enabled: {settings.AUTH_ENABLED}")

    # Validate auth settings (from original main.py)
    if settings.AUTH_ENABLED and settings.ENVIRONMENT == "production":
        if settings.AUTH_SECRET_KEY == "vidsage-dev-secret-change-in-production" or len(settings.AUTH_SECRET_KEY) < 32:
            raise RuntimeError("AUTH_SECRET_KEY must be at least 32 characters in production")

        using_plain_password = bool(settings.AUTH_PASSWORD.strip()) and not bool(settings.AUTH_PASSWORD_HASH.strip())
        if using_plain_password:
            raise RuntimeError("Use AUTH_PASSWORD_HASH instead of AUTH_PASSWORD in production")

    logger.info("✅ Startup validation passed")

    yield

    # ── Shutdown ─────────────────────────────────────────
    logger.info("🛑 VidSage API shutting down...")


# ── CORS ─────────────────────────────────────────────────────
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    CORS_ORIGINS.append(settings.FRONTEND_URL)
else:
    CORS_ORIGINS.extend(["https://vidsage.com", "https://www.vidsage.com"])

# ── App Creation ─────────────────────────────────────────────
app = FastAPI(
    title="VidSage API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Middleware (order matters — last added = first executed) ──

# 1. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Disposition", "X-Request-ID", "X-RateLimit-*"],
)

# 2. Security headers
from app.middleware.security import SecurityHeadersMiddleware
app.add_middleware(SecurityHeadersMiddleware)

# 3. Request logging
from app.middleware.request_logger import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)

# 4. Rate limiting (outermost — catches everything first)
from app.middleware.rate_limiter import RateLimitMiddleware
app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.REDIS_URL,
)

# ── Routes ────────────────────────────────────────────────────
app.include_router(auth.router)

auth_dependency = [Depends(require_auth)]
app.include_router(video.router, dependencies=auth_dependency)
app.include_router(transcription.router, dependencies=auth_dependency)
app.include_router(upload.router, dependencies=auth_dependency)
app.include_router(clean.router, dependencies=auth_dependency)
app.include_router(text_input.router, dependencies=auth_dependency)
app.include_router(chat.router, dependencies=auth_dependency)
app.include_router(notes.router, dependencies=auth_dependency)
app.include_router(pdf.router, dependencies=auth_dependency)

# ── Exception Handlers ───────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred. Please try again later."},
    )

# ── Health & Info Endpoints ───────────────────────────────────
@app.get("/")
async def root():
    return {"message": "VidSage API running"}

@app.get("/about")
async def about():
    return {
        "project": "VidSage",
        "description": "AI-Powered Universal Video Assistant",
        "version": "1.0.0",
        "features": [
            "YouTube video transcription (manual + auto captions)",
            "Whisper speech-to-text (faster-whisper)",
            "Audio file upload with background processing",
            "3-layer transcript cleaning (regex, dictionary, Groq LLM)",
        ],
        "tech_stack": ["FastAPI", "faster-whisper", "yt-dlp", "Groq API", "Next.js"],
        "author": "VidSage Team",
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
    }

@app.get("/health/detailed")
async def health_detailed():
    """Detailed health check including dependencies."""
    checks = {"api": "healthy"}

    # Check Redis
    try:
        import redis
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        checks["redis"] = "healthy"
    except Exception as e:
        checks["redis"] = f"unhealthy: {str(e)[:100]}"

    # Check ChromaDB
    try:
        import chromadb
        client = chromadb.PersistentClient(path=settings.CHROMA_DB_DIR)
        client.heartbeat()
        checks["chromadb"] = "healthy"
    except Exception as e:
        checks["chromadb"] = f"unhealthy: {str(e)[:100]}"

    all_healthy = all("healthy" in v for v in checks.values())
    return {
        "status": "healthy" if all_healthy else "degraded",
        "checks": checks,
        "environment": settings.ENVIRONMENT,
    }
