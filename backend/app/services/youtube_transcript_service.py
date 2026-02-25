from youtube_transcript_api import YouTubeTranscriptApi
import logging

logger = logging.getLogger(__name__)


class YouTubeTranscriptService:

    # Preferred languages for manual transcripts (in priority order)
    PREFERRED_LANGUAGES = ['en', 'hi', 'es', 'de', 'fr', 'ja', 'pt', 'zh', 'ko', 'ru', 'ar']

    @staticmethod
    def fetch_transcript(video_id: str):
        try:
            print(f"🔍 Checking YouTube transcript for video: {video_id}")
            
            # New API requires instantiation
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)

            # Log available transcripts
            print(f"📊 Available transcripts:")
            for transcript in transcript_list:
                print(f"  Language: {transcript.language_code}, Manual: {not transcript.is_generated}, Generated: {transcript.is_generated}")

            # 1️ Try to find manually created transcript
            for transcript in transcript_list:
                if not transcript.is_generated:
                    print(f"✅ Found MANUAL transcript: {transcript.language_code}")
                    segments_raw = transcript.fetch()
                    
                    # New API returns objects, not dicts - convert to dict format
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
                        "source": "youtube_manual",
                        "language": transcript.language_code,
                        "text": full_text,
                        "segments": segments
                    }

            # 2️ No manual transcript available → Whisper will handle it
            print(f"❌ No MANUAL transcript found for {video_id} → Falling back to Whisper")
            return {"success": False}

        except Exception as e:
            print(f"⚠️ Error fetching YouTube transcript: {str(e)}")
            logger.error(f"YouTube transcript error for {video_id}: {str(e)}")
            return {"success": False}