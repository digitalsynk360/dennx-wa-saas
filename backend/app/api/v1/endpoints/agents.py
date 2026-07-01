"""
Agents endpoint — Phase 13. Mounted at /api/v1/agents.

Reuses the same WorkspaceMember data as Sub Admins (Phase 3) but
reshaped for the Agents page: shows online status, last seen, and a
live count of open conversations currently assigned to each agent.

  GET /agents
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.workspace import AgentResponse
from app.services import workspace_service

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    ctx: WorkspaceContext = Depends(require_permission("members.manage")),
    db: AsyncSession = Depends(get_db),
):
    agents = await workspace_service.list_agents(db, ctx.workspace.id)
    return [AgentResponse(**a) for a in agents]
