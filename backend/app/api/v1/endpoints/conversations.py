"""
Inbox / Conversations endpoints.

  GET  /conversations               list (open inbox)
  GET  /conversations/history       resolved conversations
  GET  /conversations/agents        workspace members for assign dropdown
  GET  /conversations/{id}          single conversation
  GET  /conversations/{id}/messages messages in conversation
  POST /conversations/{id}/messages send a message
  PATCH /conversations/{id}         resolve / intervene / assign
  WS   /ws/{workspace_id}          real-time updates
"""
import uuid

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, get_workspace_context, require_permission
from app.core.database import get_db
from app.schemas.conversation import (
    ConversationListResponse,
    ConversationResponse,
    MessageListResponse,
    MessageResponse,
    SendMessageRequest,
    UpdateConversationRequest,
    WorkspaceMemberBrief,
)
from app.services import conversation_service
from app.services import workspace_service
from app.websocket.manager import manager

router = APIRouter(prefix="/conversations", tags=["conversations"])
ws_router = APIRouter(tags=["websocket"])


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    handling: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    ctx: WorkspaceContext = Depends(require_permission("conversations.read")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await conversation_service.list_conversations(
        db, ctx.workspace.id, status_filter="open",
        handling=handling, page=page, page_size=page_size,
    )
    return ConversationListResponse(
        items=[ConversationResponse.model_validate(c) for c in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/history", response_model=ConversationListResponse)
async def list_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    ctx: WorkspaceContext = Depends(require_permission("conversations.read")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await conversation_service.list_conversations(
        db, ctx.workspace.id, status_filter="resolved",
        page=page, page_size=page_size,
    )
    return ConversationListResponse(
        items=[ConversationResponse.model_validate(c) for c in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/agents", response_model=list[WorkspaceMemberBrief])
async def list_agents_for_assign(
    ctx: WorkspaceContext = Depends(require_permission("conversations.write")),
    db: AsyncSession = Depends(get_db),
):
    """Returns workspace members (agents) for the Assign Agent dropdown."""
    agents = await workspace_service.list_agents(db, ctx.workspace.id)
    return [WorkspaceMemberBrief(**a) for a in agents]


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("conversations.read")),
    db: AsyncSession = Depends(get_db),
):
    conv, _, _ = await conversation_service.get_conversation_messages(
        db, ctx.workspace.id, conversation_id, page=1, page_size=1
    )
    return ConversationResponse.model_validate(conv)


@router.get("/{conversation_id}/messages", response_model=MessageListResponse)
async def get_messages(
    conversation_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    ctx: WorkspaceContext = Depends(require_permission("conversations.read")),
    db: AsyncSession = Depends(get_db),
):
    _, messages, total = await conversation_service.get_conversation_messages(
        db, ctx.workspace.id, conversation_id, page=page, page_size=page_size,
    )
    return MessageListResponse(
        items=[MessageResponse.model_validate(m) for m in messages],
        total=total,
    )


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    conversation_id: uuid.UUID,
    payload: SendMessageRequest,
    ctx: WorkspaceContext = Depends(require_permission("conversations.write")),
    db: AsyncSession = Depends(get_db),
):
    msg = await conversation_service.send_message(
        db, ctx.workspace.id, conversation_id, payload, ctx.user.id
    )
    return MessageResponse.model_validate(msg)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: uuid.UUID,
    payload: UpdateConversationRequest,
    ctx: WorkspaceContext = Depends(require_permission("conversations.write")),
    db: AsyncSession = Depends(get_db),
):
    conv = await conversation_service.update_conversation(
        db, ctx.workspace.id, conversation_id, payload
    )
    return ConversationResponse.model_validate(conv)


# ---- WebSocket ----

@ws_router.websocket("/ws/{workspace_id}")
async def websocket_endpoint(websocket: WebSocket, workspace_id: str):
    """Real-time inbox updates — subscribe by workspace_id."""
    await manager.connect(workspace_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(workspace_id, websocket)