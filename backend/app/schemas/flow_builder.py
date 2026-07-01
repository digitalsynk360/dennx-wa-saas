"""Pydantic schemas for the Production Flow Builder (Phase 10 extended)."""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NodeData(BaseModel):
    """Generic node data — any key-value pairs from the canvas."""
    model_config = ConfigDict(extra="allow")


class FlowNodeSchema(BaseModel):
    id: str
    type: str
    position: dict[str, float]
    data: dict[str, Any] = Field(default_factory=dict)


class FlowEdgeSchema(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None
    label: str | None = None


class SaveFlowDraftRequest(BaseModel):
    nodes: list[FlowNodeSchema]
    edges: list[FlowEdgeSchema]
    viewport: dict[str, Any] = Field(default_factory=dict)
    changelog: str | None = None


class PublishFlowRequest(BaseModel):
    changelog: str | None = None


class FlowVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    flow_id: uuid.UUID
    version_number: int
    status: str
    nodes: list[dict]
    edges: list[dict]
    viewport: dict
    published_at: datetime | None
    changelog: str | None
    created_at: datetime


class FlowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    trigger_type: str
    nodes: list[dict]
    edges: list[dict]
    viewport: dict
    version: int
    created_at: datetime


class CreateFlowRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    trigger_type: str = Field(
        default="keyword",
        description="keyword | new_message | webhook | schedule | manual"
    )


class FlowListResponse(BaseModel):
    items: list[FlowResponse]
    total: int


class ExecutionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    node_id: str
    node_type: str
    status: str
    input_data: dict
    output_data: dict
    selected_output: str | None
    duration_ms: int | None
    error_message: str | None
    created_at: datetime


class FlowExecutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    flow_id: uuid.UUID
    status: str
    current_node_id: str | None
    variables: dict
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    is_test: bool
    created_at: datetime


class TestFlowRequest(BaseModel):
    """Trigger a test execution from the Test Flow panel."""
    trigger_data: dict[str, Any] = Field(default_factory=dict)
    contact_phone: str | None = None   # override — uses a test contact if None


class TestFlowResponse(BaseModel):
    execution: FlowExecutionResponse
    logs: list[ExecutionLogResponse]


class AutoLayoutRequest(BaseModel):
    """Request auto-layout calculation for nodes."""
    nodes: list[FlowNodeSchema]
    edges: list[FlowEdgeSchema]
    direction: str = "TB"   # TB (top-to-bottom) | LR (left-to-right)


class AutoLayoutResponse(BaseModel):
    nodes: list[FlowNodeSchema]