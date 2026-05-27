"""
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
transcription_service = GroqTranscriptionService()