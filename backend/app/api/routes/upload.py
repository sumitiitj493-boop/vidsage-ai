"""
Audio Upload Routes

Handles audio file uploads and transcription jobs.
Flow: Upload file -> get job_id -> poll status -> fetch result
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from datetime import datetime
from app.services.audio_uploader import audio_uploader_service
# from app.services.transcription_service import TranscriptionService # Removed
from app.api.deps import transcription_service
from app.services.transcript_cleaner import TranscriptCleaner
from app.services.job_manager import job_manager
from app.services.rag_service import rag_service # Import RAG service


router = APIRouter(
    prefix="/api/audio",
    tags=["Audio Upload"]
)

# Load once at startup — loading inside a route would be too slow
# transcription_service = TranscriptionService() # Removed local init

@router.post("/upload")
async def upload_and_start_transcription(
    file: UploadFile = File(..., description="Audio file to upload")
):
    """
    Saves the uploaded file, creates a job, and starts transcription in the background.
    Returns a job_id immediately — no waiting.
    """

    # create job record before writing so we can update status during upload
    job_id = job_manager.create_job()
    job_manager.update_status(job_id, "uploading")

    try:
        upload_result = await audio_uploader_service.save_file(file)
        job_manager.update_file_path(job_id, upload_result.file_path)
        job_manager.update_status(job_id, "queued")
    except Exception as e:
        job_manager.fail_job(job_id, str(e))
        raise HTTPException(status_code=400, detail=str(e))

    # push to Celery queue so workers handle it
    from app.tasks.transcription_tasks import process_audio_job
    process_audio_job.delay(job_id, upload_result.file_path)

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

    response = {
        "job_id": job_id,
        "status": job["status"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    }

    # Provide progress metadata so clients can show a progress bar
    if job.get("progress") is not None:
        response["progress"] = job["progress"]
    if job.get("elapsed") is not None:
        response["elapsed"] = job["elapsed"]
    if job.get("estimated") is not None:
        response["estimated"] = job["estimated"]

    if job.get("error"):
        response["error"] = job["error"]
        
    return response


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