"""
VidSage Configuration
Loads settings from .env file
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings:
    # Groq API (free LLM + Whisper API)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    # Whisper settings
    WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "cpu")

    # File paths
    DOWNLOAD_DIR: str = "app/downloads"
    UPLOAD_DIR: str = "app/uploads"

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

settings = Settings()
