#!/usr/bin/env python3
"""Debug script to test YouTube Transcript API"""

from youtube_transcript_api import YouTubeTranscriptApi

# Test video IDs
test_videos = {
    "Crash Course Grammar": "UejW-WQpujs",
    "Rick Roll": "dQw4w9WgXcQ",
    "Khan Academy (likely has manual)": "VscGW2PvXLU"
}

for video_name, video_id in test_videos.items():
    print(f"\n{'='*60}")
    print(f"Testing: {video_name}")
    print(f"Video ID: {video_id}")
    print(f"{'='*60}")
    
    try:
        # Get all available transcripts
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        print(f"✅ Successfully fetched transcript list")
        print(f"📊 Total available: {len(transcript_list._manually_created_transcripts) + len(transcript_list._generated_transcripts)}")
        
        # Check manually created
        if transcript_list._manually_created_transcripts:
            print(f"\n🟢 MANUAL Transcripts Found ({len(transcript_list._manually_created_transcripts)}):")
            for t in transcript_list._manually_created_transcripts:
                print(f"   - {t.language} ({t.language_code}) - is_generated: {t.is_generated}")
                # Fetch actual content
                segments = t.fetch()
                sample_text = " ".join([s["text"] for s in segments[:3]])
                print(f"     Sample: {sample_text[:100]}...")
        else:
            print(f"\n🔴 NO MANUAL transcripts")
        
        # Check auto-generated
        if transcript_list._generated_transcripts:
            print(f"\n🟡 AUTO-GENERATED Transcripts Found ({len(transcript_list._generated_transcripts)}):")
            for t in transcript_list._generated_transcripts:
                print(f"   - {t.language} ({t.language_code}) - is_generated: {t.is_generated}")
        else:
            print(f"\n🔴 NO AUTO-GENERATED transcripts")
            
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}")
        print(f"   {str(e)}")

print(f"\n{'='*60}")
print("Test Complete!")
