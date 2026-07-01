"""
Celery task surface. Phase 1 ships the contract that later phases
implement; bodies delegate to services that don't exist yet via local
imports (so importing this module never fails). Periodic tasks below
are fully functional from day one.
"""
from celery.utils.log import get_task_logger

from app.core.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="app.workers.tasks.health_check")
def health_check() -> str:
    """Smoke test: celery -A app.core.celery_app call app.workers.tasks.health_check"""
    return "ok"


@celery_app.task(
    name="app.workers.tasks.process_webhook_event",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def process_webhook_event(self, payload: dict) -> None:
    """Inbound Meta webhook event (Phase 4)."""
    from app.services import webhook_processor

    webhook_processor.process(payload)


@celery_app.task(name="app.workers.tasks.dispatch_campaign", bind=True)
def dispatch_campaign(self, campaign_id: str) -> None:
    """Fan a campaign out into per-recipient send tasks (Phase 8)."""
    from app.services import campaign_dispatcher

    campaign_dispatcher.dispatch(campaign_id)


@celery_app.task(
    name="app.workers.tasks.send_campaign_message",
    bind=True,
    max_retries=5,
    retry_backoff=True,
    rate_limit="20/s",
)
def send_campaign_message(self, recipient_id: str) -> None:
    """Send one templated message with retry + backoff (Phase 8)."""
    from app.services import campaign_dispatcher

    campaign_dispatcher.send_one(recipient_id)


@celery_app.task(name="app.workers.tasks.run_ai_task", bind=True, max_retries=2)
def run_ai_task(self, task_type: str, payload: dict) -> dict:
    """LLM jobs: suggested replies, summaries, lead scoring (Phase 12)."""
    from app.services import ai_runner

    return ai_runner.run(task_type, payload)


@celery_app.task(name="app.workers.tasks.sync_template_statuses")
def sync_template_statuses() -> None:
    """Beat: poll Meta for template approval changes (Phase 9)."""
    logger.info("template status sync tick")


@celery_app.task(name="app.workers.tasks.expire_stale_conversations")
def expire_stale_conversations() -> None:
    """Beat: clear conversations whose 24h session window lapsed."""
    from datetime import datetime, timezone

    from sqlalchemy import create_engine, text

    from app.core.config import settings

    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE conversations
                SET session_expires_at = NULL
                WHERE session_expires_at IS NOT NULL
                  AND session_expires_at < :now
                """
            ),
            {"now": datetime.now(timezone.utc)},
        )
    engine.dispose()
