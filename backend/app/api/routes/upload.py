"""
Audio Upload Routes

Handles audio file uploads and transcription jobs.
Flow: Upload file -> get job_id -> poll status -> fetch result
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from datetime import datetime
from app.services.audio_uploader import audio_uploader_service
from app.services.transcription_service import TranscriptionService
from app.services.transcript_cleaner import TranscriptCleaner
from app.services.job_manager import job_manager


router = APIRouter(
    prefix="/api/audio",
    tags=["Audio Upload"]
)

# Load once at startup — loading inside a route would be too slow
transcription_service = TranscriptionService()


def process_transcription(job_id: str):
    """Runs in the background after upload. Transcribes and cleans the audio."""

    try:
        job = job_manager.get_job(job_id)
        if not job:
            return

        job_manager.update_status(job_id, "processing")

        result = transcription_service.transcribe(job["file_path"])
        cleaned = TranscriptCleaner.clean(result.text)

        segments_data = [
            {"start": s.start, "end": s.end, "text": s.text}
            for s in result.segments
        ]

        job_manager.complete_job(job_id, {
            "raw_text": result.text,
            "cleaned_text": cleaned["cleaned_text"],
            "cleaning_steps": cleaned["cleaning_steps"],
            "language": result.language,
            "duration": result.duration,
            "segments": segments_data
        })

    except Exception as e:
        job_manager.fail_job(job_id, str(e))


@router.post("/upload")
async def upload_and_start_transcription(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Audio file to upload")
):
    """
    Saves the uploaded file, creates a job, and starts transcription in the background.
    Returns a job_id immediately — no waiting.
    """

    try:
        upload_result = await audio_uploader_service.save_file(file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    job_id = job_manager.create_job(upload_result.file_path)
    background_tasks.add_task(process_transcription, job_id)

    return {
        "success": True,
        "message": "File uploaded successfully. Transcription started in background.",
        "job_id": job_id,
        "file_size_mb": upload_result.file_size_mb,
        "timestamp": datetime.now().isoformat()
    }


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    """Returns the current status of a transcription job."""

    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job_id,
        "status": job["status"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"]
    }


@router.get("/result/{job_id}")
async def get_result(job_id: str):
    """Returns the transcript once the job is completed."""

    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "completed":
        return {
            "status": job["status"],
            "message": "Transcription not completed yet."
        }

    return {
        "status": "completed",
        "result": job["result"]
    }


@router.get("/health")
async def health_check():
    """Basic health check for load balancers and uptime monitors."""

    return {
        "status": "healthy",
        "service": "audio-upload",
        "timestamp": datetime.now().isoformat()
    }