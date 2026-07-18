"""
Template endpoints — Phase 8. Mounted at /api/v1/templates.

  GET    /templates               list local templates
  POST   /templates               create draft template
  POST   /templates/{id}/submit   submit to Meta for approval
  POST   /templates/sync          pull latest statuses from Meta
  DELETE /templates/{id}          delete a template
"""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.template import CreateTemplateRequest, TemplateListResponse, TemplateResponse
from app.services import template_service

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("/upload-header-media")
async def upload_header_media(
    file: UploadFile = File(...),
    ctx: WorkspaceContext = Depends(require_permission("templates.write")),
    db: AsyncSession = Depends(get_db),
):
    """Uploads an image/video/document to Meta and returns the media
    handle needed as the HEADER example when submitting the template."""
    allowed_types = {
        "image/jpeg", "image/png", "video/mp4",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")
    content = await file.read()
    if len(content) > 16 * 1024 * 1024:
        raise HTTPException(400, "File must be under 16 MB.")

    handle = await template_service.upload_header_media(
        db, ctx.workspace.id, file.filename or "upload", file.content_type, content,
    )
    return {"header_handle": handle, "filename": file.filename}


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    ctx: WorkspaceContext = Depends(require_permission("templates.read")),
    db: AsyncSession = Depends(get_db),
):
    templates = await template_service.list_templates(db, ctx.workspace.id)
    return TemplateListResponse(
        items=[TemplateResponse.model_validate(t) for t in templates],
        total=len(templates),
    )


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(
    payload: CreateTemplateRequest,
    ctx: WorkspaceContext = Depends(require_permission("templates.write")),
    db: AsyncSession = Depends(get_db),
):
    template = await template_service.create_template(db, ctx.workspace.id, payload)
    return TemplateResponse.model_validate(template)


@router.post("/{template_id}/submit", response_model=TemplateResponse)
async def submit_template(
    template_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("templates.write")),
    db: AsyncSession = Depends(get_db),
):
    template = await template_service.submit_to_meta(db, ctx.workspace.id, template_id)
    return TemplateResponse.model_validate(template)


@router.post("/sync", response_model=TemplateListResponse)
async def sync_templates(
    ctx: WorkspaceContext = Depends(require_permission("templates.write")),
    db: AsyncSession = Depends(get_db),
):
    templates = await template_service.sync_from_meta(db, ctx.workspace.id)
    return TemplateListResponse(
        items=[TemplateResponse.model_validate(t) for t in templates],
        total=len(templates),
    )


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("templates.write")),
    db: AsyncSession = Depends(get_db),
):
    await template_service.delete_template(db, ctx.workspace.id, template_id)