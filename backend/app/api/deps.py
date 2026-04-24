from app.services.transcription_service import TranscriptionService
from app.config import settings
from app.security import verify_access_token
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from threading import Lock


class _LazyTranscriptionService:
    """Thread-safe lazy wrapper to avoid loading Whisper at import time."""

    def __init__(self):
        self._instance: TranscriptionService | None = None
        self._lock = Lock()

    def _get(self) -> TranscriptionService:
        if self._instance is None:
            with self._lock:
                if self._instance is None:
                    self._instance = TranscriptionService(
                        model_size=settings.WHISPER_MODEL_SIZE,
                        device=settings.WHISPER_DEVICE,
                    )
        return self._instance

    def __getattr__(self, item):
        return getattr(self._get(), item)


transcription_service = _LazyTranscriptionService()

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if not settings.AUTH_ENABLED:
        return {"sub": "anonymous"}

    bearer_token = credentials.credentials if (credentials and credentials.credentials) else None
    cookie_token = request.cookies.get(settings.AUTH_ACCESS_COOKIE_NAME)
    token = bearer_token or cookie_token

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


# Backward-compatible alias for existing imports.
require_auth = get_current_user

