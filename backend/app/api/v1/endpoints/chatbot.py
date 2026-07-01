"""
Chatbot Rules endpoints — Phase 9. Mounted at /api/v1/chatbot.

  GET    /chatbot/rules            list rules (priority order)
  POST   /chatbot/rules            create a rule
  PATCH  /chatbot/rules/{id}       update a rule
  DELETE /chatbot/rules/{id}       delete a rule
  POST   /chatbot/rules/reorder    drag-and-drop priority reorder
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.chatbot import (
    ChatbotRuleResponse,
    CreateChatbotRuleRequest,
    ReorderRulesRequest,
    UpdateChatbotRuleRequest,
)
from app.services import chatbot_service

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


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
    rule = await chatbot_service.create_rule(db, ctx.workspace.id, payload)
    return ChatbotRuleResponse.model_validate(rule)


@router.patch("/rules/{rule_id}", response_model=ChatbotRuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    payload: UpdateChatbotRuleRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    rule = await chatbot_service.update_rule(db, ctx.workspace.id, rule_id, payload)
    return ChatbotRuleResponse.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    await chatbot_service.delete_rule(db, ctx.workspace.id, rule_id)


@router.post("/rules/reorder", status_code=204)
async def reorder_rules(
    payload: ReorderRulesRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    await chatbot_service.reorder_rules(db, ctx.workspace.id, payload.rule_ids_in_order)
