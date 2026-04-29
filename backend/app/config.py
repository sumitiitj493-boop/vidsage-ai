"""
VidSage Configuration
Loads settings from .env file
"""

import os
from pathlib import Path
from dotenv import load_dotenv


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

# Load .env from backend directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings:
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").strip().lower()

    # Groq API (free LLM + Whisper API)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    # Whisper settings
    WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "cpu")
    WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "auto")

    # File paths
    backend_root = Path(__file__).parent.parent
    DOWNLOAD_DIR: str = os.getenv("DOWNLOAD_DIR", str(backend_root / "app" / "downloads"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", str(backend_root / "app" / "uploads"))

    # Cleaning settings
    CLEANING_MODEL: str = os.getenv("CLEANING_MODEL", "llama-3.1-8b-instant")
    MAX_CHUNK_SIZE: int = 2500  # characters per LLM chunk (reduced slightly for rate limits)

    # Fallback LLM (OpenRouter / OpenAI-compatible)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_URL: str = os.getenv("OPENROUTER_URL", "https://openrouter.ai/api/v1")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "gpt-4o-mini")
    OPENROUTER_TIMEOUT: int = int(os.getenv("OPENROUTER_TIMEOUT", "120"))

    # RAG Settings
    # Use absolute path for ChromaDB to avoid CWD issues
    CHROMA_DB_DIR: str = str(Path(__file__).parent.parent / "chroma_db") 

    # Redis connection used by Celery and job manager
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Authentication Settings
    AUTH_ENABLED: bool = _as_bool(os.getenv("AUTH_ENABLED"), True)
    AUTH_USERNAME: str = os.getenv("AUTH_USERNAME", "admin")
    AUTH_PASSWORD: str = os.getenv("AUTH_PASSWORD", "change-me")
    AUTH_PASSWORD_HASH: str = os.getenv("AUTH_PASSWORD_HASH", "")
    AUTH_SECRET_KEY: str = os.getenv("AUTH_SECRET_KEY", "vidsage-dev-secret-change-in-production")
    AUTH_ISSUER: str = os.getenv("AUTH_ISSUER", "vidsage-api")
    AUTH_AUDIENCE: str = os.getenv("AUTH_AUDIENCE", "vidsage-client")
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    AUTH_REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("AUTH_REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    AUTH_ACCESS_COOKIE_NAME: str = os.getenv("AUTH_ACCESS_COOKIE_NAME", "vidsage_access")
    AUTH_REFRESH_COOKIE_NAME: str = os.getenv("AUTH_REFRESH_COOKIE_NAME", "vidsage_refresh")
    AUTH_COOKIE_SECURE: bool = _as_bool(os.getenv("AUTH_COOKIE_SECURE"), ENVIRONMENT == "production")
    AUTH_COOKIE_SAMESITE: str = os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
    AUTH_TOKEN_LEEWAY_SECONDS: int = int(os.getenv("AUTH_TOKEN_LEEWAY_SECONDS", "30"))
    AUTH_MAX_LOGIN_ATTEMPTS: int = int(os.getenv("AUTH_MAX_LOGIN_ATTEMPTS", "6"))
    AUTH_LOGIN_WINDOW_SECONDS: int = int(os.getenv("AUTH_LOGIN_WINDOW_SECONDS", "300"))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(AUTH_ACCESS_TOKEN_EXPIRE_MINUTES))
    )

settings = Settings()
