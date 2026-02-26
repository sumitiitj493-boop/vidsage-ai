from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable
)
import logging

logger = logging.getLogger(__name__)


class YouTubeTranscriptService:

    PREFERRED_LANGUAGES = ['en', 'hi', 'es', 'de', 'fr', 'ja', 'pt', 'zh', 'ko', 'ru', 'ar']

    @staticmethod
    def fetch_transcript(video_id: str):

        try:
            logger.info(f"Checking YouTube transcript for video: {video_id}")

            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)

            manual_transcripts = [
                t for t in transcript_list if not t.is_generated
            ]

            auto_transcripts = [
                t for t in transcript_list if t.is_generated
            ]

            # 1️ Try manual transcript with language priority
            for lang in YouTubeTranscriptService.PREFERRED_LANGUAGES:
                for t in manual_transcripts:
                    if t.language_code.startswith(lang):
                        logger.info(f"Using MANUAL transcript ({t.language_code})")
                        return YouTubeTranscriptService._format_transcript(t)

            # 2️ If manual exists but not preferred language
            if manual_transcripts:
                logger.info(f"Using MANUAL transcript ({manual_transcripts[0].language_code})")
                return YouTubeTranscriptService._format_transcript(manual_transcripts[0])

            # 3️ Try auto transcript (fast fallback)
            for lang in YouTubeTranscriptService.PREFERRED_LANGUAGES:
                for t in auto_transcripts:
                    if t.language_code.startswith(lang):
                        logger.info(f"Using AUTO transcript ({t.language_code})")
                        return YouTubeTranscriptService._format_transcript(t)

            # 4️ If nothing usable
            logger.info(f"No usable transcript found for {video_id}")
            return {"success": False}

        except (NoTranscriptFound, TranscriptsDisabled, VideoUnavailable):
            logger.info(f"No transcript available for video {video_id}")
            return {"success": False}

        except Exception as e:
            logger.error(f"Unexpected YouTube transcript error for {video_id}: {e}")
            return {"success": False}

    @staticmethod
    def _format_transcript(transcript):
        segments_raw = transcript.fetch()

        segments = [
            {
                "text": s.text,
                "start": s.start,
                "duration": s.duration
            }
            for s in segments_raw
        ]

        full_text = " ".join(s["text"] for s in segments)

        return {
            "success": True,
            "source": "youtube_manual" if not transcript.is_generated else "youtube_auto",
            "language": transcript.language_code,
            "text": full_text,
            "segments": segments
        }