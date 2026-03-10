"""Job manager with Redis backend for shared web/worker state."""

import uuid
import json
from datetime import datetime
from typing import Any, Dict
from app.config import settings
import redis


class JobManager:
    def __init__(self):
        # use Redis so both the API server and Celery workers see the same data
        self.redis = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

    def _make_key(self, job_id: str) -> str:
        return f"job:{job_id}"

    def _save(self, job_id: str, data: Dict[str, Any]) -> None:
        self.redis.set(self._make_key(job_id), json.dumps(data))

    def _load(self, job_id: str) -> Dict[str, Any] | None:
        raw = self.redis.get(self._make_key(job_id))
        if raw is None:
            return None
        return json.loads(raw)

    def create_job(self, file_path: str | None = None) -> str:
        job_id = uuid.uuid4().hex
        record = {
            "job_id": job_id,
            "file_path": file_path,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
            "result": None,
            "error": None
        }
        self._save(job_id, record)
        return job_id

    def update_status(self, job_id: str, status: str):
        record = self._load(job_id)
        if record:
            record["status"] = status
            self._save(job_id, record)

    def update_progress(self, job_id: str, percent: int, elapsed: float, estimated: float):
        record = self._load(job_id)
        if record:
            record["progress"] = percent
            record["elapsed"] = elapsed
            record["estimated"] = estimated
            self._save(job_id, record)

    def update_file_path(self, job_id: str, file_path: str):
        record = self._load(job_id)
        if record:
            record["file_path"] = file_path
            self._save(job_id, record)

    def complete_job(self, job_id: str, result: Any):
        record = self._load(job_id)
        if record:
            record["status"] = "completed"
            record["completed_at"] = datetime.now().isoformat()
            record["result"] = result
            self._save(job_id, record)

    def fail_job(self, job_id: str, error: str):
        record = self._load(job_id)
        if record:
            record["status"] = "failed"
            record["error"] = error
            record["completed_at"] = datetime.now().isoformat()
            self._save(job_id, record)

    def get_job(self, job_id: str):
        return self._load(job_id)

    def list_jobs(self) -> list[dict]:
        keys = self.redis.keys("job:*")
        jobs: list[dict] = []
        for key in keys:
            raw = self.redis.get(key)
            if raw:
                try:
                    jobs.append(json.loads(raw))
                except Exception:
                    pass
        return jobs


# Singleton
job_manager = JobManager()