
# Simple In-Memory Job Manager Tracks transcription jobs and their status


import uuid
from datetime import datetime
from typing import Dict, Any


class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}

    def create_job(self, file_path: str) -> str:
        job_id = uuid.uuid4().hex
        self.jobs[job_id] = {
            "job_id": job_id,
            "file_path": file_path,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
            "result": None,
            "error": None
        }
        return job_id

    def update_status(self, job_id: str, status: str):
        if job_id in self.jobs:
            self.jobs[job_id]["status"] = status

    def complete_job(self, job_id: str, result: Any):
        if job_id in self.jobs:
            self.jobs[job_id]["status"] = "completed"
            self.jobs[job_id]["completed_at"] = datetime.now().isoformat()
            self.jobs[job_id]["result"] = result

    def fail_job(self, job_id: str, error: str):
        if job_id in self.jobs:
            self.jobs[job_id]["status"] = "failed"
            self.jobs[job_id]["error"] = error
            self.jobs[job_id]["completed_at"] = datetime.now().isoformat()

    def get_job(self, job_id: str):
        return self.jobs.get(job_id)


# Singleton
job_manager = JobManager()