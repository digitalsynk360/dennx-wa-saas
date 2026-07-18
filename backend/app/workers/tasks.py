"""
Celery task surface.

CRITICAL PATTERN: this entire codebase is async (SQLAlchemy async
sessions, httpx async client), but Celery tasks are plain sync
functions. Every task below bridges that gap with asyncio.run(),
which gives the task its OWN event loop — completely separate from
the FastAPI process's event loop. This is why tasks use their own
AsyncSessionLocal() rather than reusing any session/connection from
the web process (that would crash — connections aren't fork/process
safe).

Running campaign dispatch here (instead of asyncio.create_task() in
the API process) means:
  - It no longer competes with API request handling for the same 2
    uvicorn workers' CPU/event loop time.
  - It gets its own DB connection pool budget (via engine below),
    so a burst of campaigns can't starve unrelated users' requests.
  - If the API process restarts/redeploys, in-flight campaigns
    survive — Celery re-delivers the task to another worker instead
    of losing it silently.
"""
import asyncio
import uuid

from celery.utils.log import get_task_logger

from app.core.celery_app import celery_app

logger = get_task_logger(__name__)


def _run_async(coro):
    """Runs an async coroutine to completion inside a sync Celery
    task, on a fresh event loop dedicated to this task execution."""
    return asyncio.run(coro)


@celery_app.task(name="app.workers.tasks.health_check")
def health_check() -> str:
    """Smoke test: celery -A app.core.celery_app call app.workers.tasks.health_check"""
    return "ok"


@celery_app.task(
    name="app.workers.tasks.dispatch_campaign",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
)
def dispatch_campaign(self, workspace_id: str, campaign_id: str) -> None:
    """Runs the full campaign send loop (paced, one short DB
    connection per recipient — see campaign_dispatcher._run_dispatch).
    Safe to retry: each recipient is only sent once because the loop
    re-checks `recipient.status == "pending"` before sending."""
    from app.services.campaign_dispatcher import _run_dispatch

    try:
        _run_async(_run_dispatch(uuid.UUID(workspace_id), uuid.UUID(campaign_id)))
    except Exception as exc:
        logger.error("dispatch_campaign_failed campaign_id=%s error=%s", campaign_id, str(exc))
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.tasks.crawl_knowledge_base",
    bind=True,
    max_retries=2,
)
def crawl_knowledge_base(self, workspace_id: str, url: str, max_pages: int) -> None:
    from app.services.knowledge_service import crawl_website

    try:
        _run_async(crawl_website(uuid.UUID(workspace_id), url, max_pages))
    except Exception as exc:
        logger.error("crawl_kb_failed workspace_id=%s error=%s", workspace_id, str(exc))
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.tasks.process_kb_upload",
    bind=True,
    max_retries=2,
)
def process_kb_upload(self, workspace_id: str, filename: str, content_b64: str) -> None:
    import base64
    from app.services.knowledge_service import process_upload

    try:
        content = base64.b64decode(content_b64)
        _run_async(process_upload(uuid.UUID(workspace_id), filename, content))
    except Exception as exc:
        logger.error("process_kb_upload_failed workspace_id=%s error=%s", workspace_id, str(exc))
        raise self.retry(exc=exc)


@celery_app.task(name="app.workers.tasks.reindex_knowledge_base", bind=True, max_retries=2)
def reindex_knowledge_base(self, workspace_id: str) -> None:
    from app.services.knowledge_service import reindex_all

    try:
        _run_async(reindex_all(uuid.UUID(workspace_id)))
    except Exception as exc:
        logger.error("reindex_kb_failed workspace_id=%s error=%s", workspace_id, str(exc))
        raise self.retry(exc=exc)


@celery_app.task(name="app.workers.tasks.sync_template_statuses")
def sync_template_statuses() -> None:
    """Beat: poll Meta for template approval changes, every 5 min,
    across every workspace with a connected WhatsApp account."""
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models.whatsapp import WhatsAppAccount
    from app.services import template_service

    async def _run():
        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(WhatsAppAccount.workspace_id).where(WhatsAppAccount.status == "live")
            )
            workspace_ids = [row[0] for row in res.all()]
            for ws_id in workspace_ids:
                try:
                    await template_service.sync_from_meta(db, ws_id)
                except Exception as e:
                    logger.warning("template_sync_failed workspace_id=%s error=%s", ws_id, str(e))
            await db.commit()

    _run_async(_run())


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