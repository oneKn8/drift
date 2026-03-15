from app.tasks.celery_app import celery_app


def test_celery_app_configured():
    assert celery_app.main == "audio_engine"
    assert "redis" in celery_app.conf.broker_url


def test_ping_task():
    from app.tasks.celery_app import ping
    result = ping.apply()
    assert result.get() == "pong"
