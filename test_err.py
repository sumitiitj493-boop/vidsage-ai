from app.services.youtube_transcript_service import YouTubeTranscriptService
res = YouTubeTranscriptService.fetch_transcript('3dINsjyfooY')
print("Keys:", res.keys())
