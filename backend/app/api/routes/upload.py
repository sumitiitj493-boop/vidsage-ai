"""
Audio Upload Routes

Handles audio file uploads and transcription jobs.
Flow: Upload file -> get job_id -> poll status -> fetch result
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from starlette.concurrency import run_in_threadpool
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


async def process_transcription(job_id: str):
    """Runs in the background after upload. Transcribes and cleans the audio."""

    try:
        job = job_manager.get_job(job_id)
        if not job:
            return

        job_manager.update_status(job_id, "processing")

        # Preprocess audio before transcription (convert, denoise, trim silence)
        from app.utils.audio_preprocess import preprocess_audio
        import time as _time
        import os
        preprocessed_path = preprocess_audio(job["file_path"])

        progress_start_time = _time.time()
        def print_progress(percent):
            elapsed = _time.time() - progress_start_time
            if percent == 0:
                print(f"Transcription progress for job {job_id}: 0% done | Elapsed: 0.0s | Est. left: --", flush=True)
            elif percent < 100:
                est_total = elapsed / (percent / 100) if percent > 0 else 0
                est_left = est_total - elapsed if percent > 0 else 0
                print(f"Transcription progress for job {job_id}: {percent}% done | Elapsed: {elapsed:.1f}s | Est. left: {est_left:.1f}s", flush=True)
            else:
                print(f"Transcription progress for job {job_id}: 100% done | Elapsed: {elapsed:.1f}s | Est. left: 0.0s", flush=True)

        # Run blocking transcription in a separate thread to avoid blocking the event loop
        try:
            result = await run_in_threadpool(
                lambda: transcription_service.transcribe(preprocessed_path, progress_callback=print_progress)
            )
        finally:
            # Clean up temp file
            if os.path.exists(preprocessed_path):
                os.remove(preprocessed_path)
        
        # Clean the transcript (Async)
        # We disable LLM cleaning here to keep the "offline/local" promise by default, 
        # but you can enable it if you want Groq cleaning for uploads too.
        cleaned = await TranscriptCleaner.clean(result.text, use_llm=False)

        segments_data = [
            {"start": s.start, "end": s.end, "text": s.text}
            for s in result.segments
        ]

        # 4. RAG Indexing (Important Step for "Chat with Audio")
        # For uploaded files, the JOB_ID becomes the "VIDEO_ID"
        try:
           # We now index SEGMENTS to support timestamps
           rag_service.index_video(job_id, segments_data)
        except Exception as e:
           print(f"RAG Indexing Error for upload {job_id}: {e}")

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

    response = {
        "job_id": job_id,
        "status": job["status"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    }

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