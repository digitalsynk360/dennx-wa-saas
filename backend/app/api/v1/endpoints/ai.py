"""
AI endpoints — Phase 11. Mounted at /api/v1/ai.

  GET    /ai/knowledge                  list knowledge base docs
  POST   /ai/knowledge                  add a doc (auto-embedded)
  DELETE /ai/knowledge/{id}             delete a doc
  POST   /ai/suggest-reply              suggested reply for a conversation
  GET    /ai/conversations/{id}/summary AI summary + sentiment
  POST   /ai/ask                        ask the in-app assistant (RAG)
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.ai import (
    AskAssistantRequest,
    AskAssistantResponse,
    CreateKnowledgeDocumentRequest,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentResponse,
    SuggestReplyRequest,
    SuggestReplyResponse,
    SummarizeConversationResponse,
)
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/knowledge", response_model=KnowledgeDocumentListResponse)
async def list_knowledge(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    docs = await ai_service.list_knowledge(db, ctx.workspace.id)
    return KnowledgeDocumentListResponse(
        items=[KnowledgeDocumentResponse.model_validate(d) for d in docs], total=len(docs)
    )


@router.post("/knowledge", response_model=KnowledgeDocumentResponse, status_code=201)
async def add_knowledge(
    payload: CreateKnowledgeDocumentRequest,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    doc = await ai_service.add_knowledge(db, ctx.workspace.id, payload)
    return KnowledgeDocumentResponse.model_validate(doc)


@router.delete("/knowledge/{doc_id}", status_code=204)
async def delete_knowledge(
    doc_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    await ai_service.delete_knowledge(db, ctx.workspace.id, doc_id)


@router.post("/suggest-reply", response_model=SuggestReplyResponse)
async def suggest_reply(
    payload: SuggestReplyRequest,
    ctx: WorkspaceContext = Depends(require_permission("conversations.write")),
    db: AsyncSession = Depends(get_db),
):
    suggestion, chunks = await ai_service.suggest_reply(db, ctx.workspace.id, payload.conversation_id)
    return SuggestReplyResponse(suggestion=suggestion, used_knowledge_chunks=chunks)


@router.get("/conversations/{conversation_id}/summary", response_model=SummarizeConversationResponse)
async def summarize_conversation(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("conversations.read")),
    db: AsyncSession = Depends(get_db),
):
    result = await ai_service.summarize_conversation(db, ctx.workspace.id, conversation_id)
    return SummarizeConversationResponse(**result)


@router.post("/ask", response_model=AskAssistantResponse)
async def ask_assistant(
    payload: AskAssistantRequest,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    answer, chunks = await ai_service.ask_assistant(db, ctx.workspace.id, payload.question)
    return AskAssistantResponse(answer=answer, used_knowledge_chunks=chunks)
