"""
Audio Upload Service - VidSage 
Handles file validation, chunked saving, and metadata extraction
"""

import uuid
from pathlib import Path
from dataclasses import dataclass
from fastapi import UploadFile, HTTPException
import logging

logger = logging.getLogger(__name__)


@dataclass
class UploadResult:
    file_path: str
    original_filename: str
    file_size_mb: float


class AudioUploaderService:

    ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
    MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB
    UPLOAD_DIR = Path("app/uploads")
    CHUNK_SIZE = 1024 * 1024  # 1MB chunks

    def __init__(self):
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    async def save_file(self, file: UploadFile) -> UploadResult:
        """
        Validate and save uploaded audio file in chunks.
        Returns UploadResult with file path and metadata.
        """

        # 1. Validate file extension
        original_filename = file.filename or "unknown"
        extension = Path(original_filename).suffix.lower()

        if extension not in self.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type '{extension}'. Allowed: {', '.join(self.ALLOWED_EXTENSIONS)}"
            )

        # 2. Generate unique filename to avoid conflicts
        unique_name = f"{uuid.uuid4().hex}{extension}"
        save_path = self.UPLOAD_DIR / unique_name

        # 3. Write file in chunks (memory-safe for large files)
        total_size = 0

        try:
            with open(save_path, "wb") as f:
                while chunk := await file.read(self.CHUNK_SIZE):
                    total_size += len(chunk)

                    # Check size limit during upload
                    if total_size > self.MAX_FILE_SIZE:
                        f.close()
                        save_path.unlink(missing_ok=True)  # Delete partial file
                        raise HTTPException(
                            status_code=413,
                            detail=f"File too large. Maximum size: {self.MAX_FILE_SIZE // (1024*1024)}MB"
                        )

                    f.write(chunk)

        except HTTPException:
            raise
        except Exception as e:
            save_path.unlink(missing_ok=True)  # Cleanup on failure
            logger.error(f"Failed to save uploaded file: {e}")
            raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

        file_size_mb = round(total_size / (1024 * 1024), 2)
        logger.info(f"Saved upload: {unique_name} ({file_size_mb} MB)")

        return UploadResult(
            file_path=str(save_path),
            original_filename=original_filename,
            file_size_mb=file_size_mb
        )


# Singleton instance
audio_uploader_service = AudioUploaderService()
