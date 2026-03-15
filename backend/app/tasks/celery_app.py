from celery import Celery
from app.config import REDIS_URL

celery_app = Celery(
    "audio_engine",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.pipeline", "app.tasks.mix_render"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    result_expires=3600,
)


@celery_app.task
def ping():
    return "pong"
