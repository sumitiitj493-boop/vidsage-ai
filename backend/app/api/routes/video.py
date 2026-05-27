from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from urllib.parse import urlparse, parse_qs,unquote
import logging
from pathlib import Path
import time

from app.models.video_models import VideoRequest
from app.services.video_downloader import VideoDownloaderService
from app.services.youtube_transcript_service import YouTubeTranscriptService
from app.services.transcript_cleaner import TranscriptCleaner
from app.services.transcript_quality_checker import TranscriptQualityChecker
from app.services.rag_service import rag_service  # When a video is successfully processed, we want to immediately save it to the RAG vector database.
from app.services.job_manager import job_manager
from app.tasks.transcription_tasks import _perform_youtube_whisper_job
from app.tasks.transcription_tasks import _perform_whisper_on_file

router = APIRouter(prefix="/api/video", tags=["Video Operations"])
logger = logging.getLogger(__name__)

#  Robust & Safe YouTube Video ID Extractor
def extract_video_id(url: str):
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        path = parsed.path

        #  1️ Handle attribution links ---
        if "attribution_link" in path:
            query = parse_qs(parsed.query)
            if "u" in query:
                decoded_url = unquote(query["u"][0])
                return extract_video_id(decoded_url)

        #  2️ Handle youtu.be short links ---
        if "youtu.be" in netloc:
            return path.strip("/").split("/")[0]

        #  3️ Handle all youtube domains ---
        if any(domain in netloc for domain in [
            "youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "gaming.youtube.com"
        ]):

            # Standard watch URL
            query = parse_qs(parsed.query)
            if "v" in query:
                return query["v"][0]

            # Path-based formats
            parts = path.strip("/").split("/")

            if parts[0] in ["live", "embed", "v", "shorts"]:
                return parts[1] if len(parts) > 1 else None

        return None

    except Exception:
        return None

@router.get("/audio/{video_id}")
async def get_youtube_audio(video_id: str):
    """
    Downloads ONLY the audio for a given YouTube video ID.
    Returns the file as a downloadable attachment.
    """
    downloader = VideoDownloaderService()
    
    # Check if we already have it
    expected_path = downloader.download_dir / f"{video_id}.mp3"
    
    if not expected_path.exists():
        url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            # We must await the download_audio
            download_result = await downloader.download_audio(
                url=url,
                output_format="mp3",
                quality="192"
            )
            expected_path = Path(download_result["file_path"])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to download audio: {str(e)}")
            
    return FileResponse(
        path=expected_path,
        media_type="audio/mpeg",
        filename=f"{video_id}_audio.mp3"
    )

@router.post("/download")
async def download_video(request: VideoRequest, background_tasks: BackgroundTasks):

    start_time = time.time()
    validation_result = None  # To track why we failed/passed
    
    try:
        # 1️ Extract video ID safely
        video_id = extract_video_id(request.video_url)

        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid or unsupported YouTube URL")

        # 1.5 Fetch Video Title (CRITICAL for Validation)
        video_title = VideoDownloaderService.get_video_title(request.video_url)
        logger.info(f"Processing Video: {video_title} ({video_id})")

        # 2️ Try manual YouTube transcript first (FAST PATH)
        youtube_result = YouTubeTranscriptService.fetch_transcript(video_id)

        if youtube_result.get("success"):
            is_manual = youtube_result.get("source") == "youtube_manual"

            # CASE A: Manual Transcript (Always Trust)
            if is_manual:
                logger.info("Manual transcript found. Skipping validation.")
                cleaned = await TranscriptCleaner.clean(
                    youtube_result["text"],
                    use_llm=False  # Trust human caption
                )

                # Store for RAG immediately (Using segments for timestamps)
                rag_service.index_video(video_id, youtube_result["segments"])

                return {
                    "success": True,
                    "source": "youtube_manual",
                    "video_id": video_id,
                    "processing_time_seconds": round(time.time() - start_time, 2),
                    "routing": "manual_trusted",
                    "raw_text": youtube_result["text"],
                    "cleaned_text": cleaned["cleaned_text"],
                    "cleaning_steps": cleaned["cleaning_steps"],
                    "segments": youtube_result["segments"]
                }
            
            # CASE B: Auto-Generated (Must Validate)
            if request.force_whisper:
                logger.info("Force whisper requested by user. Skipping YouTube auto transcript validation and using Whisper.")
                validation_result = {"is_valid": False, "reason": "force_whisper_requested"}
            else:
                logger.info("Auto-generated transcript found. Running Topic Validation...")
                validation_result = TranscriptQualityChecker.validate_transcript(
                    youtube_result["text"], 
                    video_title
                )

                if validation_result["is_valid"]:
                    logger.info("Topic Validation Passed! Using auto-transcript.")
                    cleaned = await TranscriptCleaner.clean(
                        youtube_result["text"],
                        use_llm=False  # Speed optimization: Skip slow LLM cleaning
                    )

                    # Store for RAG immediately (Using segments for timestamps)
                    rag_service.index_video(video_id, youtube_result["segments"])
                    
                    return {
                        "success": True,
                        "source": "youtube_auto",
                        "video_id": video_id,
                        "processing_time_seconds": round(time.time() - start_time, 2),
                        "routing": "auto_validated",
                        "quality_check": validation_result,
                        "raw_text": youtube_result["text"],
                        "cleaned_text": cleaned["cleaned_text"],
                        "cleaning_steps": cleaned["cleaning_steps"],
                        "segments": youtube_result["segments"]
                    }
            
                # IF VALIDATION COMPLETED AND FAILED (and not forced)
                logger.warning(f"Topic Validation Failed: {validation_result.get('reason')}. Prompting user to try Whisper.")
                return {
                    "success": True,
                    "requires_whisper": True,
                    "source": "youtube_auto_rejected",
                    "video_id": video_id,
                    "processing_time_seconds": round(time.time() - start_time, 2),
                    "routing": "auto_rejected",
                    "quality_check": validation_result,
                    "raw_text": f"# ⚠️ Auto-Transcript Rejected\n\nOur system detected an automatically generated YouTube transcript for **{video_title}**, but it was rejected for the following reason:\n\n> {validation_result.get('reason', 'Topic mismatch.')}\n\n**To get a highly accurate transcript, please click the \"Try Whisper AI\" button in the Sidebar.**",
                    "cleaned_text": f"# ⚠️ Auto-Transcript Rejected\n\nOur system detected an automatically generated YouTube transcript for **{video_title}**, but it was rejected for the following reason:\n\n> {validation_result.get('reason', 'Topic mismatch.')}\n\n**To get a highly accurate transcript, please click the \"Try Whisper AI\" button in the Sidebar.**",
                    "segments": []
                }

        elif not request.force_whisper:
            # No YouTube transcript found and force_whisper is False
            is_429 = youtube_result.get("is_429", False)
            logger.warning(f"No YouTube transcript found (429: {is_429}). Prompting user to try Whisper.")
            
            if is_429:
                raw_text = f"# ⚠️ YouTube IP Blocked\n\nYouTube is currently blocking transcript requests from this server's IP address due to rate limiting.\n\n**To bypass this and generate the transcript, please click the \"Try Whisper AI\" button in the Sidebar.**"
                cleaned_text = raw_text
            else:
                raw_text = f"# ⚠️ No Transcript Available\n\nYouTube does not have any captions or transcripts available for **{video_title}**.\n\n**To generate one from scratch, please click the \"Try Whisper AI\" button in the Sidebar.**"
                cleaned_text = raw_text
            
            return {
                "success": True,
                "requires_whisper": True,
                "source": "no_transcript",
                "video_id": video_id,
                "processing_time_seconds": round(time.time() - start_time, 2),
                "routing": "no_youtube_transcript",
                "raw_text": raw_text,
                "cleaned_text": cleaned_text,
                "segments": []
            }

        # 3️ Fallback → Queue Download + Whisper as background job for real progress reporting.
        logger.info("Queueing Whisper background job for YouTube video...")
        job_id = job_manager.create_job()
        job_manager.update_status(job_id, "queued")
        job_manager.update_progress(job_id, 1, 0.0, 0.0)

        background_tasks.add_task(
            _perform_youtube_whisper_job,
            job_id,
            request.video_url,
            video_id,
            request.output_format,
            request.quality,
        )

        return {
            "success": True,
            "queued": True,
            "source": "whisper_queued",
            "video_id": video_id,
            "job_id": job_id,
            "status": "queued",
            "progress": 1,
            "processing_time_seconds": round(time.time() - start_time, 2),
            "routing": "fallback_whisper_async",
            "validation_failure_reason": validation_result.get("reason") if validation_result else "no_youtube_caption",
            "message": "Whisper job queued. Poll /api/audio/status/{job_id} for real-time progress.",
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")