content = """import ssl
import os
from celery import Celery

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

ssl_options = {}
if redis_url.startswith("rediss://"):
    ssl_options = {
        "ssl_cert_reqs": ssl.CERT_NONE,
    }

celery = Celery(
    "vidsage",
    broker=redis_url,
    backend=redis_url,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # SSL for broker
    broker_transport_options={
        "ssl": ssl_options,
    },
    # SSL for result backend
    redis_backend_use_ssl=ssl_options,
)

celery.autodiscover_tasks(["app.tasks"])
celery.conf.imports = ["app.tasks.transcription_tasks"]
"""
with open('backend/app/celery_app.py', 'w', encoding='utf-8') as f:
    f.write(content)
