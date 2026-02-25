from fastapi import APIRouter, HTTPException
from urllib.parse import urlparse, parse_qs

from app.models.video_models import VideoRequest
from app.services.video_downloader import VideoDownloaderService
from app.services.youtube_transcript_service import YouTubeTranscriptService
from app.services.transcription_service import TranscriptionService


router = APIRouter(prefix="/api/video", tags=["Video Operations"])

#  Load Whisper model once (IMPORTANT)
transcription_service = TranscriptionService()


#  Robust & Safe YouTube Video ID Extractor
def extract_video_id(url: str):
    try:
        parsed = urlparse(url)

        # youtu.be short links
        if "youtu.be" in parsed.netloc:
            parts = parsed.path.strip("/").split("/")
            return parts[0] if parts and parts[0] else None

        # youtube.com links
        if "youtube.com" in parsed.netloc:

            # Standard watch URL
            if parsed.path == "/watch":
                return parse_qs(parsed.query).get("v", [None])[0]

            # Shorts URL
            if parsed.path.startswith("/shorts/"):
                parts = parsed.path.split("/")
                return parts[2] if len(parts) > 2 else None

            # Embed URL
            if parsed.path.startswith("/embed/"):
                parts = parsed.path.split("/")
                return parts[2] if len(parts) > 2 else None

        return None

    except Exception:
        return None


@router.post("/download")
async def download_video(request: VideoRequest):

    try:
        # 1️ Extract video ID safely
        video_id = extract_video_id(request.video_url)

        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid or unsupported YouTube URL")

        # 2️ Try manual YouTube transcript first (FAST PATH)
        youtube_result = YouTubeTranscriptService.fetch_transcript(video_id)

        if youtube_result.get("success"):
            return {
                "success": True,
                "source": "youtube_manual",
                "video_id": video_id,
                "text": youtube_result["text"],
                "segments": youtube_result["segments"]
            }

        # 3️ Fallback → Download audio
        downloader = VideoDownloaderService()

        download_result = await downloader.download_audio(
            url=request.video_url,
            output_format=request.output_format,
            quality=request.quality
        )

        # 4️ Whisper Transcription
        whisper_result = transcription_service.transcribe(
            audio_path=download_result["file_path"]
        )

        return {
            "success": True,
            "source": "whisper",
            "video_id": video_id,
            "text": whisper_result.text,
            "segments": [
                {
                    "start": s.start,
                    "end": s.end,
                    "text": s.text
                }
                for s in whisper_result.segments
            ]
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")