from app.services.transcription_service import TranscriptionService
from app.config import settings

# Global instance to avoid reloading the model (heavy operation)
# This will be initialized on first import
transcription_service = TranscriptionService(
    model_size=settings.WHISPER_MODEL_SIZE,
    device=settings.WHISPER_DEVICE
)
