"""
Celery application.

Queues:
  webhooks   inbound Meta webhook processing (fast, high priority)
  campaigns  bulk/broadcast sends with per-tenant pacing
  ai         LLM calls, embeddings, summaries (slow, isolated)
  default    everything else
"""
from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "limbu_wa_saas",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

# Upstash (and most managed Redis) serve over rediss:// (TLS). Newer
# redis-py/Celery versions require ssl_cert_reqs to be explicit for
# rediss:// URLs — without this the worker/beat crash on startup with
# "A rediss:// URL must have parameter ssl_cert_reqs...". CERT_NONE
# matches the trust model REDIS_URL already uses elsewhere in the app.
import ssl as _ssl
_redis_ssl_opts = {"ssl_cert_reqs": _ssl.CERT_NONE}
_uses_ssl = settings.CELERY_BROKER_URL.startswith("rediss://")

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_queues=(
        Queue("default"),
        Queue("webhooks"),
        Queue("campaigns"),
        Queue("ai"),
    ),
    task_routes={
        "app.workers.tasks.process_webhook_event": {"queue": "webhooks"},
        "app.workers.tasks.dispatch_campaign": {"queue": "campaigns"},
        "app.workers.tasks.send_campaign_message": {"queue": "campaigns"},
        "app.workers.tasks.retry_failed_recipient": {"queue": "campaigns"},
        "app.workers.tasks.continue_queued_campaigns": {"queue": "campaigns"},
        "app.workers.tasks.run_ai_task": {"queue": "ai"},
    },
    beat_schedule={
        "sync-template-statuses": {
            "task": "app.workers.tasks.sync_template_statuses",
            "schedule": 300.0,
        },
        "expire-stale-sessions": {
            "task": "app.workers.tasks.expire_stale_conversations",
            "schedule": 600.0,
        },
        "continue-queued-campaigns": {
            "task": "app.workers.tasks.continue_queued_campaigns",
            "schedule": 10800.0,  # every 3h — safe to run often since the
            # dispatcher recomputes the real rolling-24h budget each time
        },
    },
    **({"broker_use_ssl": _redis_ssl_opts, "redis_backend_use_ssl": _redis_ssl_opts} if _uses_ssl else {}),
)