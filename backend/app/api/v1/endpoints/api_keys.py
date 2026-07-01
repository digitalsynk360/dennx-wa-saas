"""
Developer API key endpoints — Phase 13. Mounted at /api/v1/api-keys.

  GET    /api-keys           list keys (prefix only, never the full secret)
  POST   /api-keys           create a key (full secret returned once)
  DELETE /api-keys/{id}      revoke a key
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.api_key import (
    ApiKeyListResponse,
    ApiKeyResponse,
    CreateApiKeyRequest,
    CreateApiKeyResponse,
)
from app.services import api_key_service

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.get("", response_model=ApiKeyListResponse)
async def list_keys(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    keys = await api_key_service.list_keys(db, ctx.workspace.id)
    return ApiKeyListResponse(items=[ApiKeyResponse.model_validate(k) for k in keys], total=len(keys))


@router.post("", response_model=CreateApiKeyResponse, status_code=201)
async def create_key(
    payload: CreateApiKeyRequest,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    key, full_secret = await api_key_service.create_key(db, ctx.workspace.id, payload.name)
    return CreateApiKeyResponse(id=key.id, name=key.name, api_key=full_secret, created_at=key.created_at)


@router.delete("/{key_id}", status_code=204)
async def revoke_key(
    key_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    await api_key_service.revoke_key(db, ctx.workspace.id, key_id)
