from fastapi import APIRouter, HTTPException
from app.models.transcription_models import (
    TranscribeRequest,
    TranscribeResponse,
    SegmentResponse
)
from app.services.transcription_service import TranscriptionService

router = APIRouter(prefix="/transcribe", tags=["Transcription"])

transcription_service = TranscriptionService(model_size="base")


@router.post("/", response_model=TranscribeResponse)
async def transcribe_audio(request: TranscribeRequest):

    try:
        result = transcription_service.transcribe(
            audio_path=request.audio_path,
            language=request.language
        )

        segments = [
            SegmentResponse(
                start=s.start,
                end=s.end,
                text=s.text
            )
            for s in result.segments
        ]

        return TranscribeResponse(
            success=True,
            text=result.text,
            segments=segments,
            language=result.language,
            duration=result.duration
        )

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))