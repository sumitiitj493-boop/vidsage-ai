from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

class YouTubeTranscriptService:

    @staticmethod
    def fetch_transcript(video_id: str, language="en"):
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

            # Try manually created transcript first
            transcript = transcript_list.find_manually_created_transcript([language])

            data = transcript.fetch()

            return {
                "success": True,
                "source": "youtube_manual",
                "text": " ".join([item["text"] for item in data]),
                "segments": data
            }

        except Exception:
            return {
                "success": False
            }