"""
Template management service — Phase 8.

submit_template() calls Meta's Graph API to create a template under
the connected WABA, which then goes through Meta's own approval
review (status PENDING -> APPROVED/REJECTED, usually within minutes
to a day). sync_templates() polls Meta and updates local status —
called manually via 'Sync from Meta' and periodically by the Celery
beat job `sync_template_statuses` (already wired in workers/tasks.py).
"""
import uuid

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.template import Template
from app.repositories.template_repository import TemplateRepository
from app.repositories.whatsapp_repository import WhatsAppRepository
from app.schemas.template import CreateTemplateRequest
from app.services.whatsapp_service import get_decrypted_token

logger = get_logger(__name__)

META_STATUS_MAP = {
    "APPROVED": "approved",
    "PENDING": "pending",
    "REJECTED": "rejected",
    "PAUSED": "paused",
    "DISABLED": "rejected",
}


async def list_templates(db: AsyncSession, workspace_id: uuid.UUID) -> list[Template]:
    repo = TemplateRepository(db)
    return await repo.list_by_workspace(workspace_id)


async def create_template(
    db: AsyncSession, workspace_id: uuid.UUID, payload: CreateTemplateRequest
) -> Template:
    repo = TemplateRepository(db)
    existing = await repo.get_by_name(workspace_id, payload.name, payload.language)
    if existing:
        raise HTTPException(status_code=409, detail="A template with this name and language already exists.")

    template = Template(
        workspace_id=workspace_id,
        name=payload.name,
        language=payload.language,
        category=payload.category,
        status="pending",
        header_type=payload.header_type,
        header_content=payload.header_content,
        body_text=payload.body_text,
        footer_text=payload.footer_text,
        buttons=[b.model_dump(exclude_none=True) for b in payload.buttons],
        variable_samples=payload.variable_samples,
    )
    await repo.add(template)
    return template


async def submit_to_meta(db: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID) -> Template:
    """Submits a draft template to Meta for approval."""
    repo = TemplateRepository(db)
    template = await repo.get_by_id(template_id)
    if template is None or template.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Template not found.")

    wa_repo = WhatsAppRepository(db)
    account = await wa_repo.get_by_workspace(workspace_id)
    if account is None or account.status != "live":
        raise HTTPException(status_code=400, detail="Connect a WhatsApp account first.")

    token = get_decrypted_token(account)
    components = _build_meta_components(template)

    url = f"{settings.graph_api_base}/{account.waba_id}/message_templates"
    payload = {
        "name": template.name,
        "language": template.language,
        "category": template.category,
        "components": components,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})

    if response.status_code not in (200, 201):
        logger.error("template_submit_failed", body=response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meta rejected the submission: {response.text}",
        )

    data = response.json()
    template.meta_template_id = data.get("id")
    template.status = "pending"
    await db.flush()
    return template


async def sync_from_meta(db: AsyncSession, workspace_id: uuid.UUID) -> list[Template]:
    """Pulls current template statuses from Meta and updates local rows."""
    wa_repo = WhatsAppRepository(db)
    account = await wa_repo.get_by_workspace(workspace_id)
    if account is None or account.status != "live":
        raise HTTPException(status_code=400, detail="Connect a WhatsApp account first.")

    token = get_decrypted_token(account)
    url = f"{settings.graph_api_base}/{account.waba_id}/message_templates"

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {token}"}, params={"limit": 100})

    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Meta API error: {response.text}")

    repo = TemplateRepository(db)
    remote_templates = response.json().get("data", [])

    for remote in remote_templates:
        local = await repo.get_by_name(workspace_id, remote["name"], remote.get("language", "en"))
        mapped_status = META_STATUS_MAP.get(remote.get("status", "PENDING"), "pending")

        if local is None:
            local = Template(
                workspace_id=workspace_id,
                meta_template_id=remote.get("id"),
                name=remote["name"],
                language=remote.get("language", "en"),
                category=remote.get("category", "UTILITY"),
                status=mapped_status,
                body_text=_extract_body(remote.get("components", [])),
            )
            db.add(local)
        else:
            local.meta_template_id = remote.get("id")
            local.status = mapped_status
            if remote.get("rejected_reason"):
                local.rejection_reason = remote["rejected_reason"]

    await db.flush()
    return await repo.list_by_workspace(workspace_id)


async def delete_template(db: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID) -> None:
    repo = TemplateRepository(db)
    template = await repo.get_by_id(template_id)
    if template is None or template.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Template not found.")
    await repo.delete(template)


def _build_meta_components(template: Template) -> list[dict]:
    components = []
    if template.header_type and template.header_type != "none":
        components.append({
            "type": "HEADER",
            "format": template.header_type.upper(),
            "text": template.header_content if template.header_type == "text" else None,
        })
    components.append({"type": "BODY", "text": template.body_text})
    if template.footer_text:
        components.append({"type": "FOOTER", "text": template.footer_text})
    if template.buttons:
        components.append({
            "type": "BUTTONS",
            "buttons": [_map_button(b) for b in template.buttons],
        })
    return components


def _map_button(b: dict) -> dict:
    btn_type = b.get("type", "QUICK_REPLY")
    mapped = {"type": btn_type, "text": b.get("text", "")}
    if btn_type == "URL":
        mapped["url"] = b.get("url", "")
    elif btn_type == "PHONE_NUMBER":
        mapped["phone_number"] = b.get("phone_number", "")
    return mapped


def _extract_body(components: list[dict]) -> str:
    for c in components:
        if c.get("type") == "BODY":
            return c.get("text", "")
    return ""
