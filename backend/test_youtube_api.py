from app.services.youtube_transcript_service import YouTubeTranscriptService
import logging
logging.basicConfig(level=logging.DEBUG)
print(YouTubeTranscriptService.fetch_transcript('3dINsjyfooY'))
