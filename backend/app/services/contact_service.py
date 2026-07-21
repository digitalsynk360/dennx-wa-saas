"""Contact management service (Phase 6)."""
import csv
import io
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact, Tag
from app.repositories.contact_repository import ContactRepository, TagRepository
from app.schemas.contact_schema import (
    CreateContactRequest,
    ImportResult,
    UpdateContactRequest,
)


async def list_contacts(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    search: str | None,
    status_filter: str | None,
    page: int,
    page_size: int,
    tag_id: uuid.UUID | None = None,
):
    repo = ContactRepository(db)
    return await repo.list_by_workspace(
        workspace_id, search=search, status=status_filter,
        page=page, page_size=page_size, tag_id=tag_id,
    )


async def get_contact(db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID) -> Contact:
    repo = ContactRepository(db)
    contact = await repo.get_with_tags(contact_id, workspace_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found.")
    return contact


async def create_contact(
    db: AsyncSession, workspace_id: uuid.UUID, payload: CreateContactRequest
) -> Contact:
    repo = ContactRepository(db)
    existing = await repo.get_by_phone(workspace_id, payload.phone)
    if existing:
        raise HTTPException(status_code=409, detail="Contact with this phone already exists.")

    contact = Contact(
        workspace_id=workspace_id,
        phone=payload.phone,
        name=payload.name,
        email=payload.email,
        city=payload.city,
        source=payload.source,
        status=payload.status,
    )
    await repo.add(contact)
    return await repo.get_with_tags(contact.id, workspace_id)


async def update_contact(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    contact_id: uuid.UUID,
    payload: UpdateContactRequest,
) -> Contact:
    repo = ContactRepository(db)
    contact = await repo.get_with_tags(contact_id, workspace_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found.")

    if payload.name is not None:
        contact.name = payload.name
    if payload.email is not None:
        contact.email = payload.email
    if payload.city is not None:
        contact.city = payload.city
    if payload.status is not None:
        contact.status = payload.status
    if payload.is_blocked is not None:
        contact.is_blocked = payload.is_blocked

    await db.flush()
    return contact


async def delete_contact(
    db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID
) -> None:
    repo = ContactRepository(db)
    contact = await repo.get_by_id(contact_id)
    if contact is None or contact.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Contact not found.")
    await repo.delete(contact)


async def list_tags(db: AsyncSession, workspace_id: uuid.UUID) -> list[Tag]:
    repo = TagRepository(db)
    return await repo.list_by_workspace(workspace_id)


async def create_tag(db: AsyncSession, workspace_id: uuid.UUID, name: str, color: str | None) -> Tag:
    repo = TagRepository(db)
    existing = await repo.get_by_name(workspace_id, name)
    if existing:
        raise HTTPException(status_code=409, detail="Tag with this name already exists.")
    tag = Tag(workspace_id=workspace_id, name=name, color=color)
    await repo.add(tag)
    return tag


async def add_tags_to_contact(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    contact_id: uuid.UUID,
    tag_ids: list[uuid.UUID],
) -> Contact:
    repo = ContactRepository(db)
    tag_repo = TagRepository(db)
    contact = await repo.get_with_tags(contact_id, workspace_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found.")

    existing_tag_ids = {t.id for t in contact.tags}
    for tag_id in tag_ids:
        if tag_id not in existing_tag_ids:
            tag = await tag_repo.get_by_id(tag_id)
            if tag and tag.workspace_id == workspace_id:
                contact.tags.append(tag)

    await db.flush()
    return contact


async def import_contacts_csv(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    csv_content: str,
    tag_ids: list[uuid.UUID] | None = None,
) -> ImportResult:
    """Import contacts from CSV. Expected columns: phone, name, email, city."""
    repo = ContactRepository(db)
    reader = csv.DictReader(io.StringIO(csv_content))

    created = 0
    skipped = 0
    errors: list[str] = []
    seen_phones: set[str] = set()

    # Tags to attach to every imported contact
    import_tags: list = []
    if tag_ids:
        res = await db.execute(
            select(Tag).where(Tag.workspace_id == workspace_id, Tag.id.in_(tag_ids))
        )
        import_tags = list(res.scalars())

    for i, row in enumerate(reader, start=2):  # row 1 = header
        phone = (row.get("phone") or row.get("Phone") or "").strip()

        if not phone:
            errors.append(f"Row {i}: missing phone number")
            continue

        # Duplicate inside CSV
        if phone in seen_phones:
            skipped += 1
            continue

        seen_phones.add(phone)

        # Duplicate already in database
        existing = await repo.get_by_phone(workspace_id, phone)
        if existing:
            skipped += 1
            continue

        try:
            contact = Contact(
                workspace_id=workspace_id,
                phone=phone,
                name=(row.get("name") or row.get("Name") or "").strip() or None,
                email=(row.get("email") or row.get("Email") or "").strip() or None,
                city=(row.get("city") or row.get("City") or "").strip() or None,
                source="import",
            )
            if import_tags:
                contact.tags = list(import_tags)

            db.add(contact)
            created += 1

        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")

    try:
        await db.flush()
    except Exception as e:
        print("IMPORT ERROR:", e)
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"CSV import failed: {str(e)}",
        )

    return ImportResult(
        created=created,
        skipped=skipped,
        errors=errors,
    )


async def export_contacts_csv(db: AsyncSession, workspace_id: uuid.UUID) -> str:
    repo = ContactRepository(db)
    contacts = await repo.get_all_for_export(workspace_id)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["phone", "name", "email", "city", "status", "source", "tags"])
    writer.writeheader()
    for c in contacts:
        writer.writerow({
            "phone": c.phone,
            "name": c.name or "",
            "email": c.email or "",
            "city": c.city or "",
            "status": c.status,
            "source": c.source,
            "tags": ",".join(t.name for t in c.tags),
        })
    return output.getvalue()