"""
LLM engine — Phase 4 of the AI Hub.

Generates the WhatsApp bot's AI replies using the workspace's AiSettings:
mode / provider / model / encrypted key / system prompt / persona /
generation params / memory window / RAG context / error responses.

Every call is recorded in ai_usage_logs (tokens, latency, cost, success)
so the Overview + Analytics tabs show real numbers.

Providers: openai, deepseek, openrouter, mistral, grok, perplexity,
azure, ollama (OpenAI-compatible) · anthropic/claude · gemini.
"""
import time
import uuid
from datetime import datetime, timezone

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.encryption import decrypt_value
from app.models.ai_config import DEFAULT_ERROR_RESPONSES, AiSettings, AiUsageLog
from app.models.messaging import Message

logger = structlog.get_logger()

# USD per 1M tokens (input, output) — rough estimates for the cost card
PRICE_MAP = {
    "gpt-4o": (2.5, 10.0), "gpt-4o-mini": (0.15, 0.6), "gpt-4-turbo": (10.0, 30.0),
    "o3-mini": (1.1, 4.4),
    "claude-sonnet-4-5": (3.0, 15.0), "claude-opus-4-5": (15.0, 75.0), "claude-haiku-4-5": (0.8, 4.0),
    "gemini-2.0-flash": (0.1, 0.4), "gemini-1.5-pro": (1.25, 5.0),
    "deepseek-chat": (0.14, 0.28), "deepseek-reasoner": (0.55, 2.19),
}

OPENAI_COMPAT_BASES = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "mistral": "https://api.mistral.ai/v1",
    "grok": "https://api.x.ai/v1",
    "perplexity": "https://api.perplexity.ai",
}


class LlmError(Exception):
    def __init__(self, kind: str, detail: str = ""):
        self.kind = kind          # 429|timeout|provider_down|network|unknown
        self.detail = detail
        super().__init__(f"{kind}: {detail}")


async def _load_settings(db: AsyncSession, workspace_id: uuid.UUID) -> AiSettings | None:
    res = await db.execute(select(AiSettings).where(AiSettings.workspace_id == workspace_id))
    return res.scalar_one_or_none()


def _resolve_credentials(s: AiSettings) -> tuple[str, str, str | None, str | None]:
    """Returns (provider, model, api_key, base_url)."""
    if s.mode == "platform":
        # Platform credits — backend's own OpenAI key
        model = s.model if s.provider == "openai" and s.model else "gpt-4o-mini"
        return "openai", model, settings.OPENAI_API_KEY or None, None

    key = None
    if s.api_key_encrypted:
        try:
            key = decrypt_value(s.api_key_encrypted)
        except Exception:
            key = None
    return s.provider, s.model, key, s.base_url


def _persona_suffix(s: AiSettings) -> str:
    category_hint = ""
    if s.business_category:
        from app.services.ai_categories import CATEGORY_CATALOG
        cat = CATEGORY_CATALOG.get(s.business_category)
        if cat:
            category_hint = f" {cat['persona']}"
    return (
        f"\n\nYour name is '{s.assistant_name}'.{category_hint} "
        f"Reply in: {s.language}. Tone: {s.tone}. "
        "Keep WhatsApp replies short and clear (2-4 sentences), unless you are sending a document/PDF."
    )


async def _build_memory(db: AsyncSession, conversation_id: uuid.UUID, window: int) -> list[dict]:
    res = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.direction.in_(["inbound", "outbound"]))
        .order_by(Message.created_at.desc())
        .limit(max(window, 1))
    )
    msgs = list(res.scalars())[::-1]
    out: list[dict] = []
    for m in msgs:
        if not m.content:
            continue
        out.append({"role": "user" if m.direction == "inbound" else "assistant", "content": m.content[:2000]})
    return out


async def _rag_context(db: AsyncSession, workspace_id: uuid.UUID, query: str) -> str:
    try:
        from app.services.ai_service import _retrieve_context
        docs = await _retrieve_context(db, workspace_id, query, limit=3)
        if not docs:
            return ""
        joined = "\n---\n".join(d.content[:800] for d in docs)
        return f"\n\nBusiness knowledge (use this to answer, do not mention the source):\n{joined}"
    except Exception:
        return ""


# ─── Provider calls ──────────────────────────────────────────────────────

def _classify_http(status_code: int, body: str) -> LlmError:
    if status_code == 429:
        return LlmError("429", body[:120])
    if status_code in (401, 403, 402):
        return LlmError("provider_down", f"auth/billing {status_code}")
    if status_code >= 500:
        return LlmError("provider_down", f"HTTP {status_code}")
    return LlmError("unknown", f"HTTP {status_code} {body[:120]}")


async def _call_openai_compat(
    base: str, key: str | None, model: str, messages: list[dict], s: AiSettings,
    extra_headers: dict | None = None, tools: list[dict] | None = None,
) -> dict:
    headers = {"Content-Type": "application/json", **(extra_headers or {})}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": s.temperature,
        "top_p": s.top_p,
        "frequency_penalty": s.frequency_penalty,
        "presence_penalty": s.presence_penalty,
        "max_tokens": s.max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    try:
        async with httpx.AsyncClient(timeout=s.timeout_s) as client:
            r = await client.post(f"{base}/chat/completions", json=payload, headers=headers)
    except httpx.TimeoutException:
        raise LlmError("timeout")
    except httpx.HTTPError as e:
        raise LlmError("network", str(e)[:120])
    if r.status_code != 200:
        raise _classify_http(r.status_code, r.text)
    data = r.json()
    usage = data.get("usage", {})
    msg = data["choices"][0]["message"]
    tool_calls = None
    if msg.get("tool_calls"):
        import json as _json
        tool_calls = [
            {"id": tc["id"], "name": tc["function"]["name"], "arguments": _json.loads(tc["function"].get("arguments") or "{}")}
            for tc in msg["tool_calls"]
        ]
    return {
        "text": msg.get("content") or "",
        "tool_calls": tool_calls,
        "assistant_message": msg,
        "tokens_in": usage.get("prompt_tokens", 0),
        "tokens_out": usage.get("completion_tokens", 0),
    }


async def _call_anthropic(
    key: str, model: str, system: str, messages: list[dict], s: AiSettings,
    tools: list[dict] | None = None,
) -> dict:
    payload = {
        "model": model,
        "system": system,
        "messages": messages,
        "temperature": min(s.temperature, 1.0),
        "top_p": s.top_p,
        "max_tokens": s.max_tokens,
    }
    if tools:
        payload["tools"] = [
            {"name": t["function"]["name"], "description": t["function"]["description"], "input_schema": t["function"]["parameters"]}
            for t in tools
        ]
    try:
        async with httpx.AsyncClient(timeout=s.timeout_s) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages", json=payload,
                headers={"x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
            )
    except httpx.TimeoutException:
        raise LlmError("timeout")
    except httpx.HTTPError as e:
        raise LlmError("network", str(e)[:120])
    if r.status_code != 200:
        raise _classify_http(r.status_code, r.text)
    data = r.json()
    usage = data.get("usage", {})
    content_blocks = data.get("content", [])
    text = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")
    tool_calls = [
        {"id": b["id"], "name": b["name"], "arguments": b.get("input", {})}
        for b in content_blocks if b.get("type") == "tool_use"
    ] or None
    return {
        "text": text,
        "tool_calls": tool_calls,
        "assistant_message": {"role": "assistant", "content": content_blocks},
        "tokens_in": usage.get("input_tokens", 0),
        "tokens_out": usage.get("output_tokens", 0),
    }


async def _call_gemini(key: str, model: str, system: str, messages: list[dict], s: AiSettings) -> dict:
    contents = [
        {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
        for m in messages
    ]
    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {
            "temperature": s.temperature, "topP": s.top_p, "maxOutputTokens": s.max_tokens,
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    try:
        async with httpx.AsyncClient(timeout=s.timeout_s) as client:
            r = await client.post(url, json=payload)
    except httpx.TimeoutException:
        raise LlmError("timeout")
    except httpx.HTTPError as e:
        raise LlmError("network", str(e)[:120])
    if r.status_code != 200:
        raise _classify_http(r.status_code, r.text)
    data = r.json()
    usage = data.get("usageMetadata", {})
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        text = ""
    return {"text": text, "tool_calls": None, "assistant_message": None,
            "tokens_in": usage.get("promptTokenCount", 0), "tokens_out": usage.get("candidatesTokenCount", 0)}


async def _dispatch(provider: str, key: str | None, base_url: str | None,
                    model: str, system: str, history: list[dict], s: AiSettings,
                    tools: list[dict] | None = None) -> dict:
    if provider in ("anthropic", "claude"):
        if not key:
            raise LlmError("provider_down", "no api key")
        return await _call_anthropic(key, model, system, history, s, tools)
    if provider == "gemini":
        if not key:
            raise LlmError("provider_down", "no api key")
        return await _call_gemini(key, model, system, history, s)
    if provider == "ollama":
        base = (base_url or "http://localhost:11434").rstrip("/") + "/v1"
        return await _call_openai_compat(base, None, model, [{"role": "system", "content": system}, *history], s, tools=tools)
    if provider == "azure":
        if not base_url or not key:
            raise LlmError("provider_down", "azure needs base_url + key")
        base = base_url.rstrip("/") + f"/openai/deployments/{model}"
        headers = {"api-key": key}
        payload_msgs = [{"role": "system", "content": system}, *history]
        try:
            async with httpx.AsyncClient(timeout=s.timeout_s) as client:
                r = await client.post(
                    f"{base}/chat/completions?api-version=2024-02-01",
                    json={"messages": payload_msgs, "temperature": s.temperature, "max_tokens": s.max_tokens},
                    headers=headers,
                )
        except httpx.TimeoutException:
            raise LlmError("timeout")
        except httpx.HTTPError as e:
            raise LlmError("network", str(e)[:120])
        if r.status_code != 200:
            raise _classify_http(r.status_code, r.text)
        data = r.json()
        usage = data.get("usage", {})
        return {"text": data["choices"][0]["message"]["content"] or "", "tool_calls": None, "assistant_message": None,
                "tokens_in": usage.get("prompt_tokens", 0), "tokens_out": usage.get("completion_tokens", 0)}

    base = OPENAI_COMPAT_BASES.get(provider)
    if base is None:
        raise LlmError("provider_down", f"unknown provider {provider}")
    if not key:
        raise LlmError("provider_down", "no api key")
    extra = {"HTTP-Referer": "https://app.deenxconsultancy.com"} if provider == "openrouter" else None
    return await _call_openai_compat(base, key, model, [{"role": "system", "content": system}, *history], s, extra, tools=tools)


def _estimate_cost_micro(model: str, tin: int, tout: int) -> int:
    pin, pout = PRICE_MAP.get(model, (0.5, 1.5))
    usd = (tin * pin + tout * pout) / 1_000_000
    return int(usd * 1_000_000)


# ─── Public entrypoint (called by webhook pipeline) ─────────────────────

MAX_TOOL_ROUNDS = 3  # hard cap so a confused model can't loop forever


async def generate_ai_reply(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    conversation_id: uuid.UUID,
    user_message: str,
    contact_id: uuid.UUID | None = None,
    ctx: dict | None = None,
) -> str | None:
    """Returns reply text, a friendly error response, or None (AI off /
    unconfigured -> stay silent so humans can pick up).

    contact_id + ctx (token/phone_number_id/to) are optional -- without
    them the AI still replies normally, it just can't use tools that
    need to send a document or write to CRM. The webhook pipeline
    always provides both."""
    s = await _load_settings(db, workspace_id)
    if s is None or not s.enabled:
        return None

    provider, model, key, base_url = _resolve_credentials(s)
    if provider != "ollama" and not key:
        return None

    err_responses = {**DEFAULT_ERROR_RESPONSES, **(s.error_responses or {})}

    system = (s.system_prompt or "You are a helpful business assistant.") + _persona_suffix(s)
    system += await _rag_context(db, workspace_id, user_message)

    history = await _build_memory(db, conversation_id, s.memory_window)
    if not history or history[-1].get("content") != user_message:
        history.append({"role": "user", "content": user_message})
    while history and history[0]["role"] != "user":
        history.pop(0)

    from app.services import ai_tools
    enabled_tools = set((s.tools or {}).keys()) if s.tools else set()
    if s.business_category:
        from app.services.ai_categories import CATEGORY_CATALOG
        cat = CATEGORY_CATALOG.get(s.business_category)
        if cat:
            enabled_tools |= {k for k in cat["tools"] if (s.tools or {}).get(k, True)}
    tool_schemas = ai_tools.build_active_tool_schemas(enabled_tools) if (contact_id and ctx) else []

    total_tin = total_tout = 0
    t0 = time.monotonic()
    try:
        for round_num in range(MAX_TOOL_ROUNDS):
            result = await _dispatch(provider, key, base_url, model, system, history, s, tools=tool_schemas or None)
            total_tin += result["tokens_in"]
            total_tout += result["tokens_out"]

            if not result.get("tool_calls"):
                text = (result.get("text") or "").strip()
                latency = int((time.monotonic() - t0) * 1000)
                db.add(AiUsageLog(
                    workspace_id=workspace_id, provider=provider, model=model,
                    input_tokens=total_tin, output_tokens=total_tout,
                    cost_micro_usd=_estimate_cost_micro(model, total_tin, total_tout),
                    latency_ms=latency, success=True, source="chat",
                ))
                await db.flush()
                return text or None

            for tc in result["tool_calls"]:
                tool_result_text = await ai_tools.execute_tool(
                    tc["name"], tc["arguments"], db, workspace_id, conversation_id, contact_id, ctx or {},
                )
                if provider in ("anthropic", "claude"):
                    history.append(result["assistant_message"])
                    history.append({"role": "user", "content": [
                        {"type": "tool_result", "tool_use_id": tc["id"], "content": tool_result_text}
                    ]})
                else:
                    history.append(result["assistant_message"])
                    history.append({"role": "tool", "tool_call_id": tc["id"], "content": tool_result_text})

            if round_num >= MAX_TOOL_ROUNDS - 2:
                tool_schemas = []

        latency = int((time.monotonic() - t0) * 1000)
        db.add(AiUsageLog(
            workspace_id=workspace_id, provider=provider, model=model,
            input_tokens=total_tin, output_tokens=total_tout,
            cost_micro_usd=_estimate_cost_micro(model, total_tin, total_tout),
            latency_ms=latency, success=True, source="chat",
        ))
        await db.flush()
        return err_responses.get("unknown")
    except LlmError as e:
        latency = int((time.monotonic() - t0) * 1000)
        db.add(AiUsageLog(
            workspace_id=workspace_id, provider=provider, model=model,
            input_tokens=total_tin, output_tokens=total_tout, cost_micro_usd=0,
            latency_ms=latency, success=False, source="chat",
        ))
        await db.flush()
        logger.error("ai_reply_failed", kind=e.kind, detail=e.detail)
        return err_responses.get(e.kind) or err_responses.get("unknown")
    except Exception as e:
        logger.error("ai_reply_crashed", error=str(e))
        return err_responses.get("unknown")