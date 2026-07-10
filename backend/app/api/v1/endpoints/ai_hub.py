"""
AI Hub endpoints — enterprise AI configuration center. Mounted at /api/v1/ai-hub.

  GET   /ai-hub/overview          status, usage, tokens, health
  GET   /ai-hub/settings          full settings (api key masked)
  PATCH /ai-hub/settings          update settings (encrypts key, audit log)
  POST  /ai-hub/test-connection   real provider connectivity test
  GET   /ai-hub/models            dynamic model list for a provider
  GET   /ai-hub/audit-logs        last 50 config changes
"""
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.core.encryption import decrypt_value, encrypt_value
from app.core.redis import redis_client
from app.models.ai_config import (
    DEFAULT_ERROR_RESPONSES,
    DEFAULT_SECURITY,
    DEFAULT_TOOLS,
    AiAuditLog,
    AiSettings,
    AiUsageLog,
)
from app.models.platform import KnowledgeDocument

router = APIRouter(prefix="/ai-hub", tags=["ai-hub"])


# ─── Helpers ─────────────────────────────────────────────────────────────

async def _get_or_create_settings(db: AsyncSession, workspace_id: uuid.UUID) -> AiSettings:
    res = await db.execute(select(AiSettings).where(AiSettings.workspace_id == workspace_id))
    s = res.scalar_one_or_none()
    if s is None:
        s = AiSettings(
            workspace_id=workspace_id,
            error_responses=dict(DEFAULT_ERROR_RESPONSES),
            tools=dict(DEFAULT_TOOLS),
            security=dict(DEFAULT_SECURITY),
        )
        db.add(s)
        await db.flush()
    return s


def _mask_key(encrypted: str | None) -> str | None:
    if not encrypted:
        return None
    try:
        plain = decrypt_value(encrypted)
        return f"****{plain[-4:]}" if len(plain) > 4 else "****"
    except Exception:
        return "****"


async def _audit(db: AsyncSession, workspace_id: uuid.UUID, user_id, action: str, detail: dict):
    db.add(AiAuditLog(workspace_id=workspace_id, user_id=user_id, action=action, detail=detail))
    await db.flush()


# ─── Schemas ─────────────────────────────────────────────────────────────

class SettingsPatch(BaseModel):
    enabled: bool | None = None
    mode: str | None = Field(default=None, pattern="^(platform|hybrid|strict)$")
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None          # plaintext in → encrypted at rest
    base_url: str | None = None
    organization: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    frequency_penalty: float | None = Field(default=None, ge=-2, le=2)
    presence_penalty: float | None = Field(default=None, ge=-2, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=32768)
    timeout_s: int | None = Field(default=None, ge=5, le=300)
    assistant_name: str | None = None
    system_prompt: str | None = None
    language: str | None = None
    tone: str | None = None
    memory_window: int | None = Field(default=None, ge=1, le=100)
    summarizer_enabled: bool | None = None
    crm_confidence: int | None = Field(default=None, ge=50, le=100)
    crm_auto_apply: bool | None = None
    error_responses: dict | None = None
    tools: dict | None = None
    security: dict | None = None


class TestConnectionRequest(BaseModel):
    provider: str | None = None   # defaults to saved provider
    model: str | None = None
    api_key: str | None = None    # test unsaved key; else uses stored


# ─── Routes ──────────────────────────────────────────────────────────────

@router.get("/overview")
async def ai_overview(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    ws_id = ctx.workspace.id
    s = await _get_or_create_settings(db, ws_id)

    # ── Status ──
    if not s.enabled:
        status = "disabled"
    elif s.mode == "platform":
        status = "online"
    elif s.api_key_encrypted and s.last_test_status == "connected":
        status = "online"
    elif s.api_key_encrypted and s.last_test_status in (None, ""):
        status = "initializing"
    else:
        status = "offline"

    # ── Usage aggregates ──
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    async def _agg(since):
        res = await db.execute(
            select(
                func.count(AiUsageLog.id),
                func.coalesce(func.sum(case((AiUsageLog.success == True, 1), else_=0)), 0),  # noqa: E712
                func.coalesce(func.sum(AiUsageLog.input_tokens), 0),
                func.coalesce(func.sum(AiUsageLog.output_tokens), 0),
                func.coalesce(func.sum(AiUsageLog.cost_micro_usd), 0),
            ).where(AiUsageLog.workspace_id == ws_id, AiUsageLog.created_at >= since)
        )
        total, ok, tin, tout, cost = res.first()
        return {"requests": total, "success": ok, "input_tokens": tin, "output_tokens": tout, "cost_usd": round(cost / 1_000_000, 4)}

    today_agg = await _agg(today)
    week_agg = await _agg(week_ago)
    month_agg = await _agg(month_ago)
    success_rate = round(month_agg["success"] / month_agg["requests"] * 100, 1) if month_agg["requests"] else 100.0

    # ── Health checks ──
    health: dict[str, dict] = {}

    t0 = time.monotonic()
    try:
        await db.execute(select(1))
        health["database"] = {"status": "green", "latency_ms": int((time.monotonic() - t0) * 1000)}
    except Exception as e:
        health["database"] = {"status": "red", "error": str(e)[:120]}

    t0 = time.monotonic()
    try:
        await redis_client.ping()
        health["redis"] = {"status": "green", "latency_ms": int((time.monotonic() - t0) * 1000)}
    except Exception as e:
        health["redis"] = {"status": "red", "error": str(e)[:120]}

    kb_count = (await db.execute(
        select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.workspace_id == ws_id)
    )).scalar() or 0
    health["vector_db"] = {"status": "green" if kb_count > 0 else "yellow", "docs": kb_count}

    if s.mode == "platform":
        health["provider_api"] = {"status": "green", "note": "Platform AI"}
    elif s.last_test_status == "connected":
        health["provider_api"] = {"status": "green", "last_check": s.last_test_at_iso}
    elif s.api_key_encrypted:
        health["provider_api"] = {"status": "yellow", "note": s.last_test_status or "not tested"}
    else:
        health["provider_api"] = {"status": "red", "note": "no api key"}

    health["worker"] = {"status": "yellow", "note": "sync mode (Celery pending)"}
    health["memory"] = health["redis"]
    health["knowledge_base"] = health["vector_db"]

    return {
        "status": status,
        "mode": s.mode,
        "provider": s.provider,
        "model": s.model,
        "enabled": s.enabled,
        "usage": {"today": today_agg, "week": week_agg, "month": month_agg, "success_rate": success_rate},
        "tokens": {
            "input": month_agg["input_tokens"],
            "output": month_agg["output_tokens"],
            "total": month_agg["input_tokens"] + month_agg["output_tokens"],
            "estimated_cost_usd": month_agg["cost_usd"],
        },
        "health": health,
    }


@router.get("/settings")
async def get_settings(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, ctx.workspace.id)
    return {
        "enabled": s.enabled,
        "mode": s.mode,
        "provider": s.provider,
        "model": s.model,
        "api_key_masked": _mask_key(s.api_key_encrypted),
        "has_api_key": bool(s.api_key_encrypted),
        "base_url": s.base_url,
        "organization": s.organization,
        "temperature": s.temperature,
        "top_p": s.top_p,
        "frequency_penalty": s.frequency_penalty,
        "presence_penalty": s.presence_penalty,
        "max_tokens": s.max_tokens,
        "timeout_s": s.timeout_s,
        "assistant_name": s.assistant_name,
        "system_prompt": s.system_prompt,
        "language": s.language,
        "tone": s.tone,
        "memory_window": s.memory_window,
        "summarizer_enabled": s.summarizer_enabled,
        "crm_confidence": s.crm_confidence,
        "crm_auto_apply": s.crm_auto_apply,
        "error_responses": s.error_responses or dict(DEFAULT_ERROR_RESPONSES),
        "tools": s.tools or dict(DEFAULT_TOOLS),
        "security": s.security or dict(DEFAULT_SECURITY),
        "last_test_status": s.last_test_status,
        "last_test_at": s.last_test_at_iso,
    }


@router.patch("/settings")
async def patch_settings(
    payload: SettingsPatch,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, ctx.workspace.id)
    changed: dict = {}

    data = payload.model_dump(exclude_unset=True)
    api_key = data.pop("api_key", None)

    for k, v in data.items():
        if getattr(s, k, None) != v:
            setattr(s, k, v)
            changed[k] = v if k not in ("system_prompt",) else f"{len(str(v))} chars"

    if api_key is not None:
        if api_key.strip():
            s.api_key_encrypted = encrypt_value(api_key.strip())
            s.last_test_status = None  # force re-test
            changed["api_key"] = "updated"
        else:
            s.api_key_encrypted = None
            changed["api_key"] = "removed"

    await db.flush()
    if changed:
        await _audit(db, ctx.workspace.id, ctx.user.id, "settings_updated", changed)

    return {"ok": True, "changed": list(changed.keys())}


# ─── Test connection — real provider pings ───────────────────────────────

PROVIDER_TESTS = {
    "openai":     {"url": "https://api.openai.com/v1/models", "auth": "bearer"},
    "anthropic":  {"url": "https://api.anthropic.com/v1/models", "auth": "x-api-key"},
    "claude":     {"url": "https://api.anthropic.com/v1/models", "auth": "x-api-key"},
    "gemini":     {"url": "https://generativelanguage.googleapis.com/v1beta/models?key={key}", "auth": "query"},
    "deepseek":   {"url": "https://api.deepseek.com/models", "auth": "bearer"},
    "openrouter": {"url": "https://openrouter.ai/api/v1/models", "auth": "bearer"},
    "mistral":    {"url": "https://api.mistral.ai/v1/models", "auth": "bearer"},
    "grok":       {"url": "https://api.x.ai/v1/models", "auth": "bearer"},
    "perplexity": {"url": "https://api.perplexity.ai/models", "auth": "bearer"},
}


@router.post("/test-connection")
async def test_connection(
    payload: TestConnectionRequest,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, ctx.workspace.id)
    provider = (payload.provider or s.provider or "openai").lower()

    key = payload.api_key
    if not key and s.api_key_encrypted:
        try:
            key = decrypt_value(s.api_key_encrypted)
        except Exception:
            key = None

    result = "provider_down"
    detail = ""

    if provider == "ollama":
        base = (payload.model or s.base_url or "http://localhost:11434").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(f"{base}/api/tags")
            result = "connected" if r.status_code == 200 else "provider_down"
        except Exception as e:
            result, detail = "provider_down", str(e)[:120]
    elif provider == "azure":
        base = (s.base_url or "").rstrip("/")
        if not base or not key:
            result, detail = "invalid_key", "Azure ke liye Base URL + API key dono chahiye"
        else:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    r = await client.get(f"{base}/openai/models?api-version=2024-02-01", headers={"api-key": key})
                result = "connected" if r.status_code == 200 else ("invalid_key" if r.status_code in (401, 403) else "provider_down")
            except Exception as e:
                result, detail = "provider_down", str(e)[:120]
    elif provider in PROVIDER_TESTS:
        if not key:
            result, detail = "invalid_key", "API key nahi mili"
        else:
            cfg = PROVIDER_TESTS[provider]
            url = cfg["url"].replace("{key}", key)
            headers = {}
            if cfg["auth"] == "bearer":
                headers["Authorization"] = f"Bearer {key}"
            elif cfg["auth"] == "x-api-key":
                headers["x-api-key"] = key
                headers["anthropic-version"] = "2023-06-01"
            try:
                async with httpx.AsyncClient(timeout=12) as client:
                    r = await client.get(url, headers=headers)
                if r.status_code == 200:
                    result = "connected"
                elif r.status_code in (401, 403):
                    result = "invalid_key"
                elif r.status_code == 402:
                    result = "billing_required"
                elif r.status_code == 429:
                    body = r.text.lower()
                    result = "quota_exceeded" if "quota" in body or "billing" in body else "rate_limited"
                elif r.status_code >= 500:
                    result = "provider_down"
                else:
                    result, detail = "provider_down", f"HTTP {r.status_code}"
            except httpx.TimeoutException:
                result, detail = "provider_down", "timeout"
            except Exception as e:
                result, detail = "provider_down", str(e)[:120]
    else:
        result, detail = "provider_down", f"unknown provider {provider}"

    s.last_test_status = result
    s.last_test_at_iso = datetime.now(timezone.utc).isoformat()
    await db.flush()
    await _audit(db, ctx.workspace.id, ctx.user.id, "test_connection", {"provider": provider, "result": result})

    return {"result": result, "detail": detail, "tested_at": s.last_test_at_iso}


# ─── Dynamic model lists ─────────────────────────────────────────────────

FALLBACK_MODELS = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
    "anthropic": ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
    "claude": ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
    "gemini": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "openrouter": ["openai/gpt-4o", "anthropic/claude-sonnet-4-5", "google/gemini-2.0-flash"],
    "mistral": ["mistral-large-latest", "mistral-small-latest"],
    "grok": ["grok-2", "grok-2-mini"],
    "perplexity": ["sonar", "sonar-pro"],
    "azure": [],
    "ollama": ["llama3.2", "mistral", "qwen2.5"],
}


@router.get("/models")
async def list_models(
    provider: str = Query(...),
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    provider = provider.lower()
    s = await _get_or_create_settings(db, ctx.workspace.id)
    key = None
    if s.api_key_encrypted and s.provider == provider:
        try:
            key = decrypt_value(s.api_key_encrypted)
        except Exception:
            key = None

    models: list[str] = []
    try:
        if key and provider == "openai":
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 200:
                models = sorted(m["id"] for m in r.json().get("data", []) if "gpt" in m["id"] or m["id"].startswith("o"))
        elif key and provider in ("anthropic", "claude"):
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get("https://api.anthropic.com/v1/models",
                                     headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
            if r.status_code == 200:
                models = [m["id"] for m in r.json().get("data", [])]
        elif provider == "openrouter":
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get("https://openrouter.ai/api/v1/models")
            if r.status_code == 200:
                models = [m["id"] for m in r.json().get("data", [])][:60]
    except Exception:
        models = []

    if not models:
        models = FALLBACK_MODELS.get(provider, [])
    return {"provider": provider, "models": models, "dynamic": bool(models and provider in ("openai", "anthropic", "claude", "openrouter"))}


@router.get("/audit-logs")
async def audit_logs(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(AiAuditLog)
        .where(AiAuditLog.workspace_id == ctx.workspace.id)
        .order_by(AiAuditLog.created_at.desc())
        .limit(50)
    )
    return [
        {
            "id": str(log.id),
            "action": log.action,
            "detail": log.detail,
            "created_at": log.created_at.isoformat(),
        }
        for log in res.scalars()
    ]

# ═══════════════ KNOWLEDGE BASE (Phase 2) ═══════════════

from app.services import knowledge_service


class CrawlRequest(BaseModel):
    url: str
    max_pages: int = Field(default=15, ge=1, le=50)


@router.post("/knowledge/crawl")
async def start_crawl(
    payload: CrawlRequest,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    url = payload.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    status = await knowledge_service.get_status(ctx.workspace.id)
    if status.get("state") in ("crawling", "processing", "reindexing"):
        raise HTTPException(409, "Ek task pehle se chal raha hai — complete hone do.")

    background.add_task(knowledge_service.crawl_website, ctx.workspace.id, url, payload.max_pages)
    await _audit(db, ctx.workspace.id, ctx.user.id, "kb_crawl_started", {"url": url, "max_pages": payload.max_pages})
    return {"ok": True, "message": "Crawl started", "url": url}


@router.post("/knowledge/upload")
async def upload_knowledge_file(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    allowed = (".pdf", ".docx", ".txt", ".csv", ".md")
    if not file.filename or not file.filename.lower().endswith(allowed):
        raise HTTPException(400, f"Sirf {', '.join(allowed)} files supported hain.")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "File 20 MB se badi hai.")
    status = await knowledge_service.get_status(ctx.workspace.id)
    if status.get("state") in ("crawling", "processing", "reindexing"):
        raise HTTPException(409, "Ek task pehle se chal raha hai — complete hone do.")

    background.add_task(knowledge_service.process_upload, ctx.workspace.id, file.filename, content)
    await _audit(db, ctx.workspace.id, ctx.user.id, "kb_file_uploaded", {"filename": file.filename, "size": len(content)})
    return {"ok": True, "message": "Processing started", "filename": file.filename}


@router.get("/knowledge/stats")
async def knowledge_stats(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    stats = await knowledge_service.get_stats(db, ctx.workspace.id)
    stats["task"] = await knowledge_service.get_status(ctx.workspace.id)
    return stats


@router.post("/knowledge/reindex")
async def reindex_knowledge(
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    status = await knowledge_service.get_status(ctx.workspace.id)
    if status.get("state") in ("crawling", "processing", "reindexing"):
        raise HTTPException(409, "Ek task pehle se chal raha hai.")
    background.add_task(knowledge_service.reindex_all, ctx.workspace.id)
    await _audit(db, ctx.workspace.id, ctx.user.id, "kb_reindex_started", {})
    return {"ok": True, "message": "Reindex started"}


@router.delete("/knowledge/all")
async def delete_all_knowledge(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete as sa_delete
    result = await db.execute(
        sa_delete(KnowledgeDocument).where(KnowledgeDocument.workspace_id == ctx.workspace.id)
    )
    await db.flush()
    await _audit(db, ctx.workspace.id, ctx.user.id, "kb_deleted_all", {"deleted": result.rowcount})
    return {"ok": True, "deleted": result.rowcount}

# ═══════════════ MEMORY / DEFAULTS (Phase 3) ═══════════════

@router.get("/defaults")
async def get_defaults(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
):
    return {
        "error_responses": DEFAULT_ERROR_RESPONSES,
        "tools": DEFAULT_TOOLS,
        "security": DEFAULT_SECURITY,
    }


@router.post("/memory/flush")
async def flush_memory(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Delete Redis conversation-memory keys for this workspace.
    Vector DB (knowledge base) untouched."""
    ws = str(ctx.workspace.id)
    deleted = 0
    try:
        patterns = [f"ai_memory:{ws}:*", f"conv_memory:{ws}:*", f"ai_summary:{ws}:*"]
        for pattern in patterns:
            async for key in redis_client.scan_iter(match=pattern, count=200):
                await redis_client.delete(key)
                deleted += 1
    except Exception as e:
        raise HTTPException(503, f"Redis unavailable: {str(e)[:80]}")

    await _audit(db, ctx.workspace.id, ctx.user.id, "memory_flushed", {"keys_deleted": deleted})
    return {"ok": True, "keys_deleted": deleted, "note": "Vector DB untouched"}

# ═══════════════ ANALYTICS (Phase 4) ═══════════════

@router.get("/analytics")
async def ai_analytics(
    days: int = Query(30, ge=1, le=90),
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    ws_id = ctx.workspace.id
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Totals
    res = await db.execute(
        select(
            func.count(AiUsageLog.id),
            func.coalesce(func.sum(case((AiUsageLog.success == True, 1), else_=0)), 0),  # noqa: E712
            func.coalesce(func.sum(AiUsageLog.input_tokens), 0),
            func.coalesce(func.sum(AiUsageLog.output_tokens), 0),
            func.coalesce(func.sum(AiUsageLog.cost_micro_usd), 0),
            func.coalesce(func.avg(AiUsageLog.latency_ms), 0),
        ).where(AiUsageLog.workspace_id == ws_id, AiUsageLog.created_at >= since)
    )
    total, ok, tin, tout, cost, avg_lat = res.first()
    failed = total - ok

    # Daily series
    day_col = func.date_trunc("day", AiUsageLog.created_at)
    res = await db.execute(
        select(
            day_col.label("day"),
            func.count(AiUsageLog.id),
            func.coalesce(func.sum(AiUsageLog.input_tokens + AiUsageLog.output_tokens), 0),
            func.coalesce(func.sum(case((AiUsageLog.success == False, 1), else_=0)), 0),  # noqa: E712
        )
        .where(AiUsageLog.workspace_id == ws_id, AiUsageLog.created_at >= since)
        .group_by(day_col).order_by(day_col)
    )
    daily = [
        {"date": row[0].strftime("%d %b"), "requests": row[1], "tokens": row[2], "failures": row[3]}
        for row in res.all()
    ]

    # Top models / sources
    res = await db.execute(
        select(AiUsageLog.model, func.count())
        .where(AiUsageLog.workspace_id == ws_id, AiUsageLog.created_at >= since)
        .group_by(AiUsageLog.model).order_by(func.count().desc()).limit(5)
    )
    top_models = [{"model": r[0], "requests": r[1]} for r in res.all()]

    res = await db.execute(
        select(AiUsageLog.source, func.count())
        .where(AiUsageLog.workspace_id == ws_id, AiUsageLog.created_at >= since)
        .group_by(AiUsageLog.source).order_by(func.count().desc())
    )
    top_sources = [{"source": r[0], "requests": r[1]} for r in res.all()]

    return {
        "period_days": days,
        "total_requests": total,
        "success": ok,
        "failed": failed,
        "success_rate": round(ok / total * 100, 1) if total else 100.0,
        "input_tokens": tin,
        "output_tokens": tout,
        "total_tokens": tin + tout,
        "total_cost_usd": round(cost / 1_000_000, 4),
        "avg_cost_usd": round(cost / 1_000_000 / total, 6) if total else 0,
        "avg_latency_ms": int(avg_lat or 0),
        "daily": daily,
        "top_models": top_models,
        "top_sources": top_sources,
    }