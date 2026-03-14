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

            # `YouTubeTranscriptApi.list` is an instance method, so instantiate first.
            yt = YouTubeTranscriptApi()
            transcripts_obj = yt.list(video_id)

            # Extract a list of transcript objects (the library uses a TranscriptList wrapper)
            if hasattr(transcripts_obj, "transcripts"):
                all_transcripts = transcripts_obj.transcripts
            else:
                # Fallback if the internal API changes
                all_transcripts = list(transcripts_obj)

            def _transcript_text(transcript):
                """Extract full text from a transcript object (safe for dict/list formats)."""
                try:
                    segments = transcript.fetch()
                except Exception:
                    return ""

                texts = []
                if isinstance(segments, list):
                    for s in segments:
                        if isinstance(s, dict):
                            texts.append(s.get("text", ""))
                        else:
                            texts.append(getattr(s, "text", ""))
                else:
                    texts.append(str(segments))

                return " ".join([t for t in texts if t])

            def _is_likely_english(text: str) -> bool:
                """Quick heuristic: is the text mostly Latin script (likely English)?"""
                if not text:
                    return False

                # Count characters in basic ASCII range (common for English)
                total = len(text)
                latin = sum(1 for c in text if ord(c) < 128)
                return (latin / total) > 0.7

            def _match_lang(transcripts, lang_prefix, prefer_manual=True):
                """Find the first transcript matching a language prefix (e.g., 'en', 'hi')."""
                lang_prefix = lang_prefix.lower()

                # Prefer manual transcripts first if requested
                if prefer_manual:
                    for t in transcripts:
                        if (not t.is_generated) and t.language_code.lower().startswith(lang_prefix):
                            # If English is expected, ensure the text looks English.
                            if lang_prefix == 'en' and not _is_likely_english(_transcript_text(t)):
                                continue
                            return t

                # Then allow auto-generated transcripts
                for t in transcripts:
                    if t.language_code.lower().startswith(lang_prefix):
                        if lang_prefix == 'en' and not _is_likely_english(_transcript_text(t)):
                            continue
                        return t

                return None

            # 1️⃣ If any preferred-language transcript (manual or auto) exists, return it.
            for lang in YouTubeTranscriptService.PREFERRED_LANGUAGES:
                t = _match_lang(all_transcripts, lang, prefer_manual=True)
                if t:
                    source = "MANUAL" if not t.is_generated else "AUTO"
                    logger.info(f"Using {source} transcript ({t.language_code}) for preferred language {lang}")
                    return YouTubeTranscriptService._format_transcript(t)

            # 2️⃣ No preferred language transcript found: fall back to any transcript
            # Prefer manual transcripts for better quality when available.
            manual = [t for t in all_transcripts if not t.is_generated]
            if manual:
                t = manual[0]
                logger.info(f"Using MANUAL transcript ({t.language_code}) [fallback any language]")
                return YouTubeTranscriptService._format_transcript(t)

            auto = [t for t in all_transcripts if t.is_generated]
            if auto:
                t = auto[0]
                logger.info(f"Using AUTO transcript ({t.language_code}) [fallback any language]")
                return YouTubeTranscriptService._format_transcript(t)

            logger.info(f"No usable transcript found for {video_id}")
            return {"success": False}

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