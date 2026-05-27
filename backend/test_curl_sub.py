import curl_cffi.requests as requests
import json
import re

html = requests.get('https://www.youtube.com/watch?v=3dINsjyfooY', impersonate='chrome').text
match = re.search(r'ytInitialPlayerResponse\s*=\s*(\{.*?\});', html)
if match:
    data = json.loads(match.group(1))
    captions = data.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
    for c in captions:
        print(c.get('languageCode'), c.get('baseUrl')[:100])
        sub_resp = requests.get(c.get('baseUrl') + '&fmt=json3', impersonate='chrome')
        print(sub_resp.status_code, len(sub_resp.json().get('events', [])))
        break
