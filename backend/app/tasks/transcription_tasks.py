from app.celery_app import celery
from app.api.deps import transcription_service
from app.services.job_manager import job_manager
from app.utils.audio_preprocess import preprocess_audio
import os


def _perform_job(job_id: str, file_path: str, force_whisper: bool = False):   
    """Core transcription pipeline used by the Celery worker."""
    job_manager.update_file_path(job_id, file_path)
    job_manager.update_status(job_id, "preprocessing")

    # prepare audio
    preprocessed = preprocess_audio(file_path, enhance_audio=force_whisper)
    job_manager.update_status(job_id, "transcribing")

    # transcription with progress reporting
    import time as _time
    progress_start = _time.time()
    last_time = progress_start
    last_percent = 0
    avg_rate = None

    def _log_progress(percent):
        nonlocal last_time, last_percent, avg_rate
        now = _time.time()
        elapsed = now - progress_start
        interval = now - last_time

        if percent > last_percent and percent > 0:
            rate = interval / (percent - last_percent)
            if avg_rate is None:
                avg_rate = rate
            else:
                avg_rate = 0.8 * avg_rate + 0.2 * rate

        if percent == 0:
            print(f"[Transcription {job_id}] 0% elapsed 0s", flush=True)
        elif percent < 100:
            if avg_rate:
                est_left = avg_rate * (100 - percent)
            else:
                est_total = elapsed / (percent / 100) if percent > 0 else 0
                est_left = est_total - elapsed
            print(
                f"[Transcription {job_id}] {percent}% done | elapsed {elapsed:.1f}s"
                f" | since last {interval:.1f}s | est left {est_left:.1f}s",
                flush=True,
            )
        else:
            print(f"[Transcription {job_id}] 100% done | elapsed {elapsed:.1f}s", flush=True)

        try:
            job_manager.update_progress(job_id, percent, elapsed, est_left if percent < 100 else elapsed)
        except Exception:
            pass

        last_time = now
        last_percent = percent

    result = transcription_service.transcribe(preprocessed, progress_callback=_log_progress, force_accuracy=force_whisper)

    # cleanup temp file
    if preprocessed != file_path and os.path.exists(preprocessed):
        os.remove(preprocessed)

    # cleaning step
    job_manager.update_status(job_id, "cleaning")
    from app.services.transcript_cleaner import TranscriptCleaner
    import asyncio
    cleaned = asyncio.run(TranscriptCleaner.clean(result.text, use_llm=False))
    job_manager.update_status(job_id, "indexing")

    segments_data = [
        {"start": s.start, "end": s.end, "text": s.text}
        for s in result.segments
    ]

    # Complete the job FIRST so the user gets the transcript immediately!
    job_manager.complete_job(job_id, {
        "raw_text": result.text,
        "cleaned_text": cleaned["cleaned_text"],
        "cleaning_steps": cleaned["cleaning_steps"],
        "language": result.language,
        "duration": result.duration,
        "segments": segments_data,
    })

    # Indexing in the background using a separate Celery task
    index_video_task.delay(job_id, segments_data)


@celery.task(bind=True)
def process_audio_job(self, job_id: str, file_path: str):
    try:
        _perform_job(job_id, file_path)
    except Exception as exc:
        job_manager.fail_job(job_id, str(exc))
        raise self.retry(exc=exc, countdown=60, max_retries=3)


@celery.task(bind=True)
def index_video_task(self, job_id: str, segments_data: list):
    try:
        from app.services.rag_service import rag_service
        rag_service.index_video(job_id, segments_data)
        print(f"RAG indexing completed for {job_id}", flush=True)
    except Exception as e:
        print(f"RAG indexing error in celery task for {job_id}: {e}", flush=True)

