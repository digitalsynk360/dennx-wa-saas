"""
AI service — Phase 11.

Uses OpenAI for embeddings (text-embedding-3-small, 1536-dim, matches
EMBEDDING_DIMENSIONS in models/platform.py) and chat completions for
suggested replies / summaries / the in-app assistant. LangChain is
available in requirements.txt for more advanced chains later; this
phase calls the OpenAI SDK directly for simplicity and to keep
latency low on the inbox "Suggest Reply" button.

Graceful degradation: if OPENAI_API_KEY is not configured, every
function raises a clear 503 rather than crashing — so the rest of
the app (Phases 1-10) keeps working without an OpenAI key.
"""
import uuid

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.platform import KnowledgeDocument
from app.repositories.contact_repository import ContactRepository
from app.repositories.conversation_repository import ConversationRepository, MessageRepository
from app.repositories.knowledge_repository import KnowledgeRepository
from app.schemas.ai import CreateKnowledgeDocumentRequest

logger = get_logger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4o-mini"


def _require_openai_key() -> str:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI features require OPENAI_API_KEY to be set in backend/.env.",
        )
    return settings.OPENAI_API_KEY


async def _get_embedding(text: str) -> list[float]:
    api_key = _require_openai_key()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            json={"model": EMBEDDING_MODEL, "input": text},
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if response.status_code != 200:
        logger.error("openai_embedding_failed", body=response.text)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Embedding request failed.")
    return response.json()["data"][0]["embedding"]


async def _chat_completion(system_prompt: str, user_prompt: str, max_tokens: int = 400) -> str:
    api_key = _require_openai_key()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            json={
                "model": CHAT_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.4,
            },
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if response.status_code != 200:
        logger.error("openai_chat_failed", body=response.text)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI request failed.")
    return response.json()["choices"][0]["message"]["content"].strip()


# ---------------- Knowledge base CRUD ----------------

async def list_knowledge(db: AsyncSession, workspace_id: uuid.UUID) -> list[KnowledgeDocument]:
    repo = KnowledgeRepository(db)
    return await repo.list_by_workspace(workspace_id)


async def add_knowledge(
    db: AsyncSession, workspace_id: uuid.UUID, payload: CreateKnowledgeDocumentRequest
) -> KnowledgeDocument:
    embedding = await _get_embedding(payload.content)
    doc = KnowledgeDocument(
        workspace_id=workspace_id,
        title=payload.title,
        content=payload.content,
        source=payload.source,
        embedding=embedding,
    )
    repo = KnowledgeRepository(db)
    await repo.add(doc)
    return doc


async def delete_knowledge(db: AsyncSession, workspace_id: uuid.UUID, doc_id: uuid.UUID) -> None:
    repo = KnowledgeRepository(db)
    doc = await repo.get_by_id(doc_id)
    if doc is None or doc.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Knowledge document not found.")
    await repo.delete(doc)


async def _retrieve_context(db: AsyncSession, workspace_id: uuid.UUID, query: str, limit: int = 5) -> list[KnowledgeDocument]:
    repo = KnowledgeRepository(db)
    docs = await repo.list_by_workspace(workspace_id)
    if not docs:
        return []
    query_embedding = await _get_embedding(query)
    return await repo.search_similar(workspace_id, query_embedding, limit=limit)


# ---------------- Suggested replies (Inbox) ----------------

async def suggest_reply(db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> tuple[str, int]:
    conv_repo = ConversationRepository(db)
    conv = await conv_repo.get_with_contact(conversation_id, workspace_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    msg_repo = MessageRepository(db)
    messages, _ = await msg_repo.list_by_conversation(conversation_id, workspace_id, page=1, page_size=20)
    if not messages:
        raise HTTPException(status_code=400, detail="No messages in this conversation yet.")

    last_inbound = next((m for m in reversed(messages) if m.direction == "inbound"), None)
    if last_inbound is None:
        raise HTTPException(status_code=400, detail="No inbound message to reply to.")

    context_docs = await _retrieve_context(db, workspace_id, last_inbound.content or "")
    context_text = "\n---\n".join(d.content for d in context_docs)

    transcript = "\n".join(
        f"{'Customer' if m.direction == 'inbound' else 'Agent'}: {m.content}" for m in messages[-10:]
    )

    system_prompt = (
        "You are a helpful customer support assistant for a WhatsApp Business "
        "account. Write a short, polite, professional reply to the customer's "
        "latest message. Use the provided business knowledge if relevant. "
        "Keep it under 3 sentences unless more detail is clearly needed."
    )
    user_prompt = f"Business knowledge:\n{context_text or '(none available)'}\n\nConversation so far:\n{transcript}\n\nWrite the agent's next reply:"

    suggestion = await _chat_completion(system_prompt, user_prompt, max_tokens=200)
    return suggestion, len(context_docs)


# ---------------- Conversation summary ----------------

async def summarize_conversation(db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> dict:
    msg_repo = MessageRepository(db)
    messages, _ = await msg_repo.list_by_conversation(conversation_id, workspace_id, page=1, page_size=100)
    if not messages:
        raise HTTPException(status_code=400, detail="No messages to summarize.")

    transcript = "\n".join(
        f"{'Customer' if m.direction == 'inbound' else 'Agent'}: {m.content}" for m in messages
    )

    system_prompt = (
        "Summarize this WhatsApp customer support conversation in 2-3 sentences. "
        "Then classify the overall customer sentiment as exactly one word: "
        "positive, neutral, or negative. Then list up to 3 key points as a "
        "bulleted list. Respond ONLY as JSON: "
        '{"summary": "...", "sentiment": "...", "key_points": ["...", "..."]}'
    )
    raw = await _chat_completion(system_prompt, transcript, max_tokens=300)

    import json
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(cleaned)
        return {
            "summary": data.get("summary", ""),
            "sentiment": data.get("sentiment", "neutral"),
            "key_points": data.get("key_points", []),
        }
    except (json.JSONDecodeError, AttributeError):
        return {"summary": raw, "sentiment": "neutral", "key_points": []}


# ---------------- In-app assistant (RAG Q&A for the business owner) ----------------

async def ask_assistant(db: AsyncSession, workspace_id: uuid.UUID, question: str) -> tuple[str, int]:
    context_docs = await _retrieve_context(db, workspace_id, question)
    context_text = "\n---\n".join(d.content for d in context_docs)

    system_prompt = (
        "You are an AI assistant helping a business owner understand their "
        "own WhatsApp Business data and knowledge base. Answer using only "
        "the provided context. If the context doesn't contain the answer, "
        "say so honestly rather than guessing."
    )
    user_prompt = f"Context:\n{context_text or '(no knowledge base entries yet)'}\n\nQuestion: {question}"

    answer = await _chat_completion(system_prompt, user_prompt, max_tokens=400)
    return answer, len(context_docs)
