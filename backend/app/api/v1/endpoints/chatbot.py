"""
Chatbot Rules endpoints — Phase 9. Mounted at /api/v1/chatbot.

  GET    /chatbot/rules            list rules (priority order)
  POST   /chatbot/rules            create a rule
  PATCH  /chatbot/rules/{id}       update a rule
  DELETE /chatbot/rules/{id}       delete a rule
  POST   /chatbot/rules/reorder    drag-and-drop priority reorder
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.models.automation import ChatbotRule
from app.schemas.chatbot import (
    ChatbotRuleResponse,
    CreateChatbotRuleRequest,
    ReorderRulesRequest,
    UpdateChatbotRuleRequest,
)
from app.services import chatbot_service

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


async def _get_rule_or_404(
    db: AsyncSession, workspace_id: uuid.UUID, rule_id: uuid.UUID
) -> ChatbotRule:
    stmt = select(ChatbotRule).where(
        ChatbotRule.id == rule_id,
        ChatbotRule.workspace_id == workspace_id,
    )
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found."
        )
    return rule


@router.get("/rules", response_model=list[ChatbotRuleResponse])
async def list_rules(
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    rules = await chatbot_service.list_rules(db, ctx.workspace.id)
    return [ChatbotRuleResponse.model_validate(r) for r in rules]


@router.post("/rules", response_model=ChatbotRuleResponse, status_code=201)
async def create_rule(
    payload: CreateChatbotRuleRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    rule = await chatbot_service.create_rule(
        db,
        ctx.workspace.id,
        keywords=payload.keywords,
        match_type=getattr(payload, "match_type", None) or "contains",
        reply_text=getattr(payload, "reply_text", None),
        flow_id=getattr(payload, "flow_id", None),
        name=getattr(payload, "name", None) or "Rule",
    )
    return ChatbotRuleResponse.model_validate(rule)


@router.patch("/rules/{rule_id}", response_model=ChatbotRuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    payload: UpdateChatbotRuleRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule_or_404(db, ctx.workspace.id, rule_id)
    updates = payload.model_dump(exclude_unset=True)
    rule = await chatbot_service.update_rule(db, rule, **updates)
    return ChatbotRuleResponse.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule_or_404(db, ctx.workspace.id, rule_id)
    await chatbot_service.delete_rule(db, rule)


@router.post("/rules/reorder", status_code=204)
async def reorder_rules(
    payload: ReorderRulesRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    await chatbot_service.reorder_rules(db, ctx.workspace.id, payload.rule_ids_in_order)