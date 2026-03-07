from fastapi import APIRouter, HTTPException
from urllib.parse import urlparse, parse_qs,unquote
import logging
import time

from app.models.video_models import VideoRequest
from app.services.video_downloader import VideoDownloaderService
from app.services.youtube_transcript_service import YouTubeTranscriptService
from app.api.deps import transcription_service
from app.services.transcript_cleaner import TranscriptCleaner
from app.services.transcript_quality_checker import TranscriptQualityChecker
from app.services.rag_service import rag_service  # When a video is successfully processed, we want to immediately save it to the RAG vector database.

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

@router.post("/download")
async def download_video(request: VideoRequest):

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
            
            logger.warning(f"Topic Validation Failed: {validation_result.get('reason')}. Switching to Whisper.")

        # 3️ Fallback → Download & Whisper (SLOW PATH)
        logger.info("Downloading audio for Whisper...")
        downloader = VideoDownloaderService()

        download_result = await downloader.download_audio(
            url=request.video_url,
            output_format=request.output_format,
            quality=request.quality
        )

        
        # 4️ Whisper Transcription
        logger.info("Running Whisper (Local GPU/CPU)...")
        # Use simple language hint from YouTube metadata if available (even if invalid content, lang tag might be ok)
        lang_hint = None
        if youtube_result.get("language"):
             lang_hint = youtube_result["language"].split("-")[0]
             

        import time as _time
        progress_start_time = _time.time()
        def print_progress(percent):
            elapsed = _time.time() - progress_start_time
            if percent > 0:
                est_total = elapsed / (percent / 100)
                est_left = est_total - elapsed
                print(f"Transcription progress: {percent}% done | Elapsed: {elapsed:.1f}s | Est. left: {est_left:.1f}s", flush=True)
            else:
                print(f"Transcription progress: {percent}% done", flush=True)

        whisper_result = transcription_service.transcribe(
            audio_path=download_result["file_path"],
            language=lang_hint,
            progress_callback=print_progress
        )

        # 5️ Clean the transcript
        cleaned = await TranscriptCleaner.clean(
            whisper_result.text,
            use_llm=False  # Speed optimization: Skip slow LLM cleaning
        )

        # Prepare segments explicitly
        segments_data = [{"start": s.start, "end": s.end, "text": s.text} for s in whisper_result.segments]

        # Store for RAG immediately (with timestamps)
        rag_service.index_video(video_id, segments_data)

        return {
            "success": True,
            "source": "whisper",
            "video_id": video_id,
            "processing_time_seconds": round(time.time() - start_time, 2),
            "routing": "fallback_whisper",
            "validation_failure_reason": validation_result.get("reason") if validation_result else "no_youtube_caption",
            "raw_text": whisper_result.text,
            "cleaned_text": cleaned["cleaned_text"],
            "cleaning_steps": cleaned["cleaning_steps"],
            "segments": segments_data
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")