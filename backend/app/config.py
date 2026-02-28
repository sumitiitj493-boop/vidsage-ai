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
    MAX_CHUNK_SIZE: int = 3000  # characters per LLM chunk


settings = Settings()
