import requests

url = "http://127.0.0.1:8000/api/chat/ask/stream"
payload = {"video_id": "dummy", "question": "What is virtual memory?"}

print('Making request...')
r = requests.post(url, json=payload, stream=True, timeout=60)
print('Status', r.status_code)

for line in r.iter_lines(decode_unicode=True):
    if line:
        print('chunk>', line)

print('done')
