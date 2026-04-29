from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.deps import require_auth
from app.config import settings
from app.api.routes import auth, video, transcription, upload, clean, text_input, chat, pdf, notes
import logging

logger = logging.getLogger(__name__)

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Add production URL if available from settings (can be defined in config.py)
if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    CORS_ORIGINS.append(settings.FRONTEND_URL)
else:
    # Graceful fallbacks if not defined
    CORS_ORIGINS.extend(["https://vidsage.com", "https://www.vidsage.com"])

app = FastAPI(title="VidSage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Disposition"]
)

# Routers
app.include_router(auth.router)

# Protect all expensive/intensive API operations behind authentication.
auth_dependency = [Depends(require_auth)]
app.include_router(video.router, dependencies=auth_dependency)
app.include_router(transcription.router, dependencies=auth_dependency)
app.include_router(upload.router, dependencies=auth_dependency)
app.include_router(clean.router, dependencies=auth_dependency)
app.include_router(text_input.router, dependencies=auth_dependency)
app.include_router(chat.router, dependencies=auth_dependency)
app.include_router(notes.router, dependencies=auth_dependency)
app.include_router(pdf.router, dependencies=auth_dependency)


@app.on_event("startup")
async def validate_auth_settings() -> None:
    if not settings.AUTH_ENABLED:
        return

    if settings.ENVIRONMENT == "production":
        if settings.AUTH_SECRET_KEY == "vidsage-dev-secret-change-in-production" or len(settings.AUTH_SECRET_KEY) < 32:
            raise RuntimeError("AUTH_SECRET_KEY must be at least 32 characters in production")

        using_plain_password = bool(settings.AUTH_PASSWORD.strip()) and not bool(settings.AUTH_PASSWORD_HASH.strip())
        if using_plain_password:
            raise RuntimeError("Use AUTH_PASSWORD_HASH instead of AUTH_PASSWORD in production")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred. Please try again later."},
    )


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
        "tech_stack": ["FastAPI", "faster-whisper", "yt-dlp", "Groq API", "React (coming soon)"],
        "author": "VidSage Team"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}