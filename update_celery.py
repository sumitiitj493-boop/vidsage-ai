content = """import ssl
from celery import Celery
from kombu import Queue

# Build Celery config with SSL for Upstash
def _get_redis_config(url: str) -> dict:
    if url.startswith("rediss://"):
        return {
            "broker_transport_options": {
                "ssl": {
                    "ssl_cert_reqs": ssl.CERT_NONE,
                }
            },
            "redis_backend_health_check_interval": 10,
        }
    return {}

import os
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
extra_config = _get_redis_config(redis_url)

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
    **extra_config,
)

celery.autodiscover_tasks(["app.tasks"])
celery.conf.imports = ["app.tasks.transcription_tasks"]
"""

with open('backend/app/celery_app.py', 'w', encoding='utf-8') as f:
    f.write(content)
