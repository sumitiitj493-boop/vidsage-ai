import yt_dlp
import requests
import json
import logging
logging.basicConfig(level=logging.ERROR)

def get_transcript(video_id):
    ydl_opts = {'skip_download': True, 'quiet': True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        subs = info.get('subtitles', {})
        auto_subs = info.get('automatic_captions', {})
        
        target_subs = subs if subs else auto_subs
        source = "MANUAL" if subs else "AUTO"
        
        if not target_subs:
            print("No subs found.")
            return

        for lang in ['en', 'hi', 'hi-en', list(target_subs.keys())[0]]:
            if lang in target_subs:
                formats = target_subs[lang]
                json3_url = next((f['url'] for f in formats if f['ext'] == 'json3'), None)
                if json3_url:
                    print(f"[{source}] Fetching json3 for {lang}")
                    resp = requests.get(json3_url)
                    data = resp.json()
                    for event in data.get('events', [])[1:3]:
                        print(event)
                    return
                print(f"No json3 format for {lang}")
                return

get_transcript("3dINsjyfooY")
