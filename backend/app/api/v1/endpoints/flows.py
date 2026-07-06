"""
Production Flow Builder endpoints — Phase 10 complete.

  GET    /flows                    list flows
  POST   /flows                    create a new flow
  GET    /flows/{id}               get flow (latest draft)
  PUT    /flows/{id}/graph         save draft (autosave)
  POST   /flows/{id}/publish       publish flow (creates immutable version)
  POST   /flows/{id}/activate      turn on
  POST   /flows/{id}/deactivate    turn off
  DELETE /flows/{id}               delete
  GET    /flows/{id}/versions      version history
  GET    /flows/{id}/versions/{v}  get specific version
  POST   /flows/{id}/test          trigger test execution
  POST   /flows/{id}/auto-layout   compute node positions
  GET    /flows/{id}/executions    execution history
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.models.automation import ChatbotFlow
from app.models.flow_builder import FlowExecution, FlowVersion, ExecutionLog
from app.schemas.flow_builder import (
    AutoLayoutRequest,
    AutoLayoutResponse,
    CreateFlowRequest,
    FlowExecutionResponse,
    FlowListResponse,
    FlowResponse,
    FlowVersionResponse,
    PublishFlowRequest,
    SaveFlowDraftRequest,
    TestFlowRequest,
    TestFlowResponse,
    ExecutionLogResponse,
    FlowNodeSchema,
)
from app.services import flow_service

router = APIRouter(prefix="/flows", tags=["flows"])


@router.get("", response_model=FlowListResponse)
async def list_flows(
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    flows = await flow_service.list_flows(db, ctx.workspace.id)
    return FlowListResponse(items=[FlowResponse.model_validate(f) for f in flows], total=len(flows))


@router.post("", response_model=FlowResponse, status_code=201)
async def create_flow(
    payload: CreateFlowRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    flow = await flow_service.create_flow(db, ctx.workspace.id, payload)
    return FlowResponse.model_validate(flow)


@router.get("/{flow_id}", response_model=FlowResponse)
async def get_flow(
    flow_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    flow = await flow_service.get_flow(db, ctx.workspace.id, flow_id)
    return FlowResponse.model_validate(flow)


@router.put("/{flow_id}/graph", response_model=FlowResponse)
async def save_graph(
    flow_id: uuid.UUID,
    payload: SaveFlowDraftRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    from app.schemas.chatbot import SaveFlowGraphRequest
    compat = SaveFlowGraphRequest(
        nodes=[n.model_dump() for n in payload.nodes],
        edges=[e.model_dump() for e in payload.edges],
        viewport=payload.viewport,
    )
    flow = await flow_service.save_graph(db, ctx.workspace.id, flow_id, compat)
    return FlowResponse.model_validate(flow)


@router.post("/{flow_id}/publish", response_model=FlowVersionResponse)
async def publish_flow(
    flow_id: uuid.UUID,
    payload: PublishFlowRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Creates an immutable published version and activates the flow."""
    flow = await flow_service.get_flow(db, ctx.workspace.id, flow_id)

    # Deactivate previous published version
    prev = await db.execute(
        select(FlowVersion)
        .where(FlowVersion.flow_id == flow_id)
        .where(FlowVersion.status == "published")
    )
    for pv in prev.scalars().all():
        pv.status = "archived"

    from datetime import datetime, timezone
    version = FlowVersion(
        workspace_id=ctx.workspace.id,
        flow_id=flow_id,
        version_number=flow.version,
        status="published",
        nodes=flow.nodes,
        edges=flow.edges,
        viewport=flow.viewport,
        published_at=datetime.now(timezone.utc),
        created_by_id=ctx.user.id,
        changelog=payload.changelog,
    )
    db.add(version)
    flow.is_active = True
    await db.flush()
    return FlowVersionResponse.model_validate(version)


@router.post("/{flow_id}/activate", response_model=FlowResponse)
async def activate_flow(
    flow_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    flow = await flow_service.set_active(db, ctx.workspace.id, flow_id, True)
    return FlowResponse.model_validate(flow)


@router.post("/{flow_id}/deactivate", response_model=FlowResponse)
async def deactivate_flow(
    flow_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    flow = await flow_service.set_active(db, ctx.workspace.id, flow_id, False)
    return FlowResponse.model_validate(flow)



@router.get("/{flow_id}/analytics")
async def get_flow_analytics(
    flow_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    ctx: WorkspaceContext = Depends(require_permission("flows.read")),
    db: AsyncSession = Depends(get_db),
):
    """Per-flow analytics: sessions, completion rate, daily chart."""
    from datetime import timedelta, timezone
    from datetime import datetime
    from sqlalchemy import func as sa_func, case
    from app.models.automation import FlowSession

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Total / completed / waiting sessions
    res = await db.execute(
        select(
            sa_func.count(FlowSession.id).label("total"),
            sa_func.sum(case((FlowSession.status == "completed", 1), else_=0)).label("completed"),
            sa_func.sum(case((FlowSession.status == "waiting", 1), else_=0)).label("waiting"),
            sa_func.sum(case((FlowSession.status == "error", 1), else_=0)).label("errors"),
        ).where(
            FlowSession.workspace_id == ctx.workspace.id,
            FlowSession.flow_id == flow_id,
            FlowSession.created_at >= since,
        )
    )
    row = res.first()
    total = row.total or 0
    completed = row.completed or 0
    waiting = row.waiting or 0
    errors = row.errors or 0
    completion_rate = round((completed / total * 100), 1) if total > 0 else 0.0

    # Daily chart
    daily = []
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for i in range(min(days, 14), -1, -1):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        r = await db.execute(
            select(
                sa_func.count(FlowSession.id).label("total"),
                sa_func.sum(case((FlowSession.status == "completed", 1), else_=0)).label("completed"),
            ).where(
                FlowSession.workspace_id == ctx.workspace.id,
                FlowSession.flow_id == flow_id,
                FlowSession.created_at >= day_start,
                FlowSession.created_at < day_end,
            )
        )
        dr = r.first()
        daily.append({
            "date": day_start.strftime("%d %b"),
            "sessions": dr.total or 0,
            "completed": dr.completed or 0,
        })

    return {
        "flow_id": str(flow_id),
        "period_days": days,
        "total_sessions": total,
        "completed": completed,
        "waiting": waiting,
        "errors": errors,
        "completion_rate": completion_rate,
        "daily_chart": daily,
    }
@router.delete("/{flow_id}", status_code=204)
async def delete_flow(
    flow_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    await flow_service.delete_flow(db, ctx.workspace.id, flow_id)


@router.get("/{flow_id}/versions", response_model=list[FlowVersionResponse])
async def list_versions(
    flow_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FlowVersion)
        .where(FlowVersion.flow_id == flow_id)
        .where(FlowVersion.workspace_id == ctx.workspace.id)
        .order_by(FlowVersion.version_number.desc())
    )
    versions = result.scalars().all()
    return [FlowVersionResponse.model_validate(v) for v in versions]


@router.post("/{flow_id}/test", response_model=TestFlowResponse)
async def test_flow(
    flow_id: uuid.UUID,
    payload: TestFlowRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a test run — creates a FlowExecution with is_test=True."""
    from app.services import flow_engine
    from app.models.contact import Contact
    from sqlalchemy import select as sa_select

    flow = await flow_service.get_flow(db, ctx.workspace.id, flow_id)

    # Use or create a test contact
    if payload.contact_phone:
        from app.repositories.contact_repository import ContactRepository
        repo = ContactRepository(db)
        contact = await repo.get_by_phone(ctx.workspace.id, payload.contact_phone)
        if contact is None:
            contact = Contact(
                workspace_id=ctx.workspace.id,
                phone=payload.contact_phone,
                name="Test Contact",
                source="test",
            )
            db.add(contact)
            await db.flush()
    else:
        contact = Contact(
            workspace_id=ctx.workspace.id,
            phone="+919999999999",
            name="Test Contact",
            source="test",
        )
        db.add(contact)
        await db.flush()

    execution, logs = await flow_engine.start_flow(
        db=db,
        workspace_id=ctx.workspace.id,
        flow=flow,
        contact=contact,
        trigger_data=payload.trigger_data,
        ctx={},   # no real WhatsApp ctx in test mode
        is_test=True,
    )

    return TestFlowResponse(
        execution=FlowExecutionResponse.model_validate(execution),
        logs=[ExecutionLogResponse.model_validate(l) for l in logs],
    )


@router.post("/{flow_id}/auto-layout", response_model=AutoLayoutResponse)
async def auto_layout(
    flow_id: uuid.UUID,
    payload: AutoLayoutRequest,
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    """
    Simple topological auto-layout — positions nodes in a DAG grid.
    Direction: TB = top-to-bottom, LR = left-to-right.
    """
    nodes = payload.nodes
    edges = payload.edges
    direction = payload.direction

    # Build adjacency
    children: dict[str, list[str]] = {n.id: [] for n in nodes}
    parents: dict[str, list[str]] = {n.id: [] for n in nodes}
    for e in edges:
        if e.source in children:
            children[e.source].append(e.target)
        if e.target in parents:
            parents[e.target].append(e.source)

    # BFS layers
    visited: set[str] = set()
    queue = [n.id for n in nodes if not parents.get(n.id)]
    if not queue:
        queue = [nodes[0].id] if nodes else []

    layers: list[list[str]] = []
    while queue:
        layers.append(queue)
        visited.update(queue)
        next_layer = []
        for nid in queue:
            for child in children.get(nid, []):
                if child not in visited:
                    next_layer.append(child)
        queue = next_layer

    NODE_W, NODE_H = 220, 120
    H_GAP, V_GAP = 80, 60

    pos_map: dict[str, tuple[float, float]] = {}
    for layer_idx, layer in enumerate(layers):
        for col_idx, nid in enumerate(layer):
            if direction == "LR":
                x = layer_idx * (NODE_W + H_GAP)
                y = col_idx * (NODE_H + V_GAP)
            else:  # TB
                x = col_idx * (NODE_W + H_GAP)
                y = layer_idx * (NODE_H + V_GAP)
            pos_map[nid] = (x, y)

    updated_nodes = []
    for n in nodes:
        pos = pos_map.get(n.id, (n.position.get("x", 0), n.position.get("y", 0)))
        updated_nodes.append(FlowNodeSchema(
            id=n.id, type=n.type,
            position={"x": pos[0], "y": pos[1]},
            data=n.data,
        ))

    return AutoLayoutResponse(nodes=updated_nodes)


@router.get("/{flow_id}/executions", response_model=list[FlowExecutionResponse])
async def list_executions(
    flow_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    ctx: WorkspaceContext = Depends(require_permission("chatbot.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FlowExecution)
        .where(FlowExecution.flow_id == flow_id)
        .where(FlowExecution.workspace_id == ctx.workspace.id)
        .order_by(FlowExecution.created_at.desc())
        .limit(limit)
    )
    executions = result.scalars().all()
    return [FlowExecutionResponse.model_validate(e) for e in executions]