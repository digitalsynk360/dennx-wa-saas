"""
Flow Builder service — Phase 10. CRUD for the visual flow graph
(nodes/edges saved as JSONB from the React-Flow-style canvas in the
reference Flows screenshot)."""
import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import ChatbotFlow
from app.repositories.chatbot_repository import ChatbotFlowRepository
from app.schemas.chatbot import CreateFlowRequest, SaveFlowGraphRequest


async def list_flows(db: AsyncSession, workspace_id: uuid.UUID) -> list[ChatbotFlow]:
    repo = ChatbotFlowRepository(db)
    return await repo.list_by_workspace(workspace_id)


async def get_flow(db: AsyncSession, workspace_id: uuid.UUID, flow_id: uuid.UUID) -> ChatbotFlow:
    repo = ChatbotFlowRepository(db)
    flow = await repo.get_by_id(flow_id)
    if flow is None or flow.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return flow


async def create_flow(db: AsyncSession, workspace_id: uuid.UUID, payload: CreateFlowRequest) -> ChatbotFlow:
    flow = ChatbotFlow(
        workspace_id=workspace_id,
        name=payload.name,
        description=payload.description,
        trigger_type=payload.trigger_type,
        nodes=[],
        edges=[],
        viewport={},
        is_active=False,
    )
    repo = ChatbotFlowRepository(db)
    await repo.add(flow)
    return flow


async def save_graph(
    db: AsyncSession, workspace_id: uuid.UUID, flow_id: uuid.UUID, payload: SaveFlowGraphRequest
) -> ChatbotFlow:
    flow = await get_flow(db, workspace_id, flow_id)
    flow.nodes = payload.nodes
    flow.edges = payload.edges
    flow.viewport = payload.viewport
    flow.version += 1
    await db.flush()
    return flow


async def set_active(db: AsyncSession, workspace_id: uuid.UUID, flow_id: uuid.UUID, is_active: bool) -> ChatbotFlow:
    flow = await get_flow(db, workspace_id, flow_id)
    flow.is_active = is_active
    await db.flush()
    return flow


async def delete_flow(db: AsyncSession, workspace_id: uuid.UUID, flow_id: uuid.UUID) -> None:
    flow = await get_flow(db, workspace_id, flow_id)
    repo = ChatbotFlowRepository(db)
    await repo.delete(flow)
