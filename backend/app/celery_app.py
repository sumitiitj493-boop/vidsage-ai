from celery import Celery
from app.config import settings

# create Celery application object using Redis broker/backed
celery = Celery(
    "vidsage",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

# make sure tasks module is loaded so workers know about our task
celery.autodiscover_tasks(["app.tasks"])
celery.conf.imports = ["app.tasks.transcription_tasks"]
