from app.celery_app import celery
from app.api.deps import transcription_service
from app.services.job_manager import job_manager
from app.services.video_downloader import VideoDownloaderService
from app.utils.audio_preprocess import preprocess_audio
import os


def _set_stage(job_id: str, status: str, progress: int):
    job_manager.update_status(job_id, status)
    try:
        job = job_manager.get_job(job_id) or {}
        elapsed = float(job.get("elapsed") or 0)
        estimated = float(job.get("estimated") or elapsed)
        job_manager.update_progress(job_id, progress, elapsed, estimated)
    except Exception:
        pass


def _perform_job(
    job_id: str,
    file_path: str,
    force_whisper: bool = False,
    video_id_override: str | None = None,
):
    """Core transcription pipeline used by the Celery worker."""
    job_manager.update_file_path(job_id, file_path)
    _set_stage(job_id, "preprocessing", 10)

    # prepare audio
    preprocessed = preprocess_audio(file_path, enhance_audio=force_whisper)
    _set_stage(job_id, "transcribing", 20)

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
            # Keep space for non-transcription phases by mapping 0..100 -> 20..95
            mapped_percent = 20 + int(percent * 0.75)
            job_manager.update_progress(job_id, mapped_percent, elapsed, est_left if percent < 100 else elapsed)
        except Exception:
            pass

        last_time = now
        last_percent = percent

    result = transcription_service.transcribe(preprocessed, progress_callback=_log_progress, force_accuracy=force_whisper)

    # cleanup temp file
    if preprocessed != file_path and os.path.exists(preprocessed):
        os.remove(preprocessed)

    # cleaning step
    _set_stage(job_id, "cleaning", 96)
    from app.services.transcript_cleaner import TranscriptCleaner
    import asyncio
    cleaned = asyncio.run(TranscriptCleaner.clean(result.text, use_llm=False))
    _set_stage(job_id, "indexing", 98)

    segments_data = [
        {"start": s.start, "end": s.end, "text": s.text}
        for s in result.segments
    ]

    output_video_id = video_id_override or job_id

    # Complete the job FIRST so the user gets the transcript immediately!
    job_manager.complete_job(job_id, {
        "video_id": output_video_id,
        "raw_text": result.text,
        "cleaned_text": cleaned["cleaned_text"],
        "cleaning_steps": cleaned["cleaning_steps"],
        "language": result.language,
        "duration": result.duration,
        "segments": segments_data,
    })

    # Index immediately so revision notes and chat work even without a Celery worker.
    from app.services.rag_service import rag_service
    rag_service.index_video(output_video_id, segments_data)


def _perform_youtube_whisper_job(
    job_id: str,
    video_url: str,
    video_id: str,
    output_format: str = "mp3",
    quality: str = "192",
):
    """Download YouTube audio and run the same pipeline asynchronously."""
    _set_stage(job_id, "downloading", 2)
    downloader = VideoDownloaderService()
    download_result = downloader._download_sync(
        url=video_url,
        output_format=output_format,
        quality=quality,
    )
    downloaded_file = download_result["file_path"]
    _set_stage(job_id, "queued", 5)

    _perform_job(
        job_id=job_id,
        file_path=downloaded_file,
        force_whisper=False,
        video_id_override=video_id,
    )


def _perform_whisper_on_file(video_id: str, file_path: str, user_id: str):
    """Run Whisper on a manually uploaded file using the same pipeline as normal jobs."""
    from app.services.job_manager import job_manager

    # Register the job using the existing video_id as the job key
    # create_job returns a new id — we need to hijack the store to use our video_id
    job_manager.update_status(video_id, "queued")
    job_manager.update_progress(video_id, 0, 0, 0)
    job_manager.update_file_path(video_id, file_path)

    # Reuse the exact same working pipeline
    _perform_job(
        job_id=video_id,
        file_path=file_path,
        force_whisper=True,
        video_id_override=video_id,
    )


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

