"""
Contacts endpoints (Phase 6).

  GET    /contacts                 list with search/filter/pagination
  POST   /contacts                 create single contact
  GET    /contacts/{id}            get contact
  PATCH  /contacts/{id}            update contact
  DELETE /contacts/{id}            delete contact
  POST   /contacts/{id}/tags       add tags to contact
  GET    /contacts/export          download CSV
  POST   /contacts/import          upload CSV
  GET    /tags                     list workspace tags
  POST   /tags                     create tag
"""
import uuid
from io import StringIO

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, get_workspace_context, require_permission
from app.core.database import get_db
from app.schemas.contact_schema import (
    AddTagsRequest,
    ContactListResponse,
    ContactResponse,
    CreateContactRequest,
    CreateTagRequest,
    ImportResult,
    TagResponse,
    UpdateContactRequest,
)
from app.services import contact_service

router = APIRouter(tags=["contacts"])
tags_router = APIRouter(tags=["tags"])


@router.get("/contacts", response_model=ContactListResponse)
async def list_contacts(
    search: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    ctx: WorkspaceContext = Depends(require_permission("contacts.read")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await contact_service.list_contacts(
        db, ctx.workspace.id, search, status, page, page_size
    )
    return ContactListResponse(
        items=[ContactResponse.model_validate(c) for c in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/contacts/export")
async def export_contacts(
    ctx: WorkspaceContext = Depends(require_permission("contacts.read")),
    db: AsyncSession = Depends(get_db),
):
    csv_data = await contact_service.export_contacts_csv(db, ctx.workspace.id)
    return StreamingResponse(
        StringIO(csv_data),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts.csv"},
    )


@router.post("/contacts/import", response_model=ImportResult)
async def import_contacts(
    file: UploadFile = File(...),
    tag_ids: str = Form(""),
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    parsed_tag_ids: list[uuid.UUID] = []
    for part in tag_ids.split(","):
        part = part.strip()
        if part:
            try:
                parsed_tag_ids.append(uuid.UUID(part))
            except ValueError:
                pass
    result = await contact_service.import_contacts_csv(
        db, ctx.workspace.id,
        content.decode("utf-8", errors="replace"),
        tag_ids=parsed_tag_ids or None,
    )
    return result


@router.post("/contacts", response_model=ContactResponse, status_code=201)
async def create_contact(
    payload: CreateContactRequest,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    contact = await contact_service.create_contact(db, ctx.workspace.id, payload)
    return ContactResponse.model_validate(contact)


@router.get("/contacts/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("contacts.read")),
    db: AsyncSession = Depends(get_db),
):
    contact = await contact_service.get_contact(db, ctx.workspace.id, contact_id)
    return ContactResponse.model_validate(contact)


@router.patch("/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: uuid.UUID,
    payload: UpdateContactRequest,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    contact = await contact_service.update_contact(db, ctx.workspace.id, contact_id, payload)
    return ContactResponse.model_validate(contact)


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    await contact_service.delete_contact(db, ctx.workspace.id, contact_id)


@router.delete("/contacts/{contact_id}/tags/{tag_id}", response_model=ContactResponse)
async def remove_tag_from_contact(
    contact_id: uuid.UUID,
    tag_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    contact = await contact_service.get_contact(db, ctx.workspace.id, contact_id)
    contact.tags = [t for t in contact.tags if t.id != tag_id]
    await db.flush()
    return ContactResponse.model_validate(contact)


@router.post("/contacts/{contact_id}/tags", response_model=ContactResponse)
async def add_tags(
    contact_id: uuid.UUID,
    payload: AddTagsRequest,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    contact = await contact_service.add_tags_to_contact(
        db, ctx.workspace.id, contact_id, payload.tag_ids
    )
    return ContactResponse.model_validate(contact)


@tags_router.get("/tags", response_model=list[TagResponse])
async def list_tags(
    ctx: WorkspaceContext = Depends(require_permission("contacts.read")),
    db: AsyncSession = Depends(get_db),
):
    tags = await contact_service.list_tags(db, ctx.workspace.id)
    return [TagResponse.model_validate(t) for t in tags]


@tags_router.post("/tags", response_model=TagResponse, status_code=201)
async def create_tag(
    payload: CreateTagRequest,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    tag = await contact_service.create_tag(db, ctx.workspace.id, payload.name, payload.color)
    return TagResponse.model_validate(tag)