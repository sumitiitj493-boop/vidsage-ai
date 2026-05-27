# VidSage

A lightweight backend for audio/video transcription and retrieval.

This service uses Celery with Redis for background job processing; make sure
Redis is running (e.g. via Docker) before uploading audio.

## Job status stages
Clients can poll `/api/audio/status/{job_id}` to learn what the server is doing.
Possible values are:

- `uploading` – file is currently being written to disk
- `queued` – job is in Redis and waiting for a worker
- `preprocessing` – audio is being converted/normalized with ffmpeg
- `transcribing` – Whisper model is running (progress/estimate shown)
- `cleaning` – transcript post‑processing is happening
- `indexing` – segments are being inserted into the RAG database
- `completed` – job finished successfully
- `failed` – an error occurred, see `error` field for details

## Development

Run the API from the `backend` directory:

```bash
python -m venv .venv
. .venv/Scripts/activate    # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --reload-exclude "chroma_db/*"
```

Start Redis (Docker example):

```bash
docker run -d --name vidsage-redis -p 6379:6379 redis:latest
```

Start a Celery worker:

```bash
cd backend
celery -A app.celery_app worker -l info -P solo
```

Then use Swagger at `http://localhost:8000/docs` to upload audio.

Commands noted above should be adjusted if deploying to production or using
Linux (you can remove `-P solo` and add `--concurrency=N`).
