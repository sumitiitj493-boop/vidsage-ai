from fastapi import APIRouter, HTTPException
from urllib.parse import urlparse, parse_qs,unquote

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