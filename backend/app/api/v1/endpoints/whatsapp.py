"""
WhatsApp account + webhook endpoints.

  POST /whatsapp/connect           connect with credentials
  DELETE /whatsapp/disconnect      disconnect
  GET  /whatsapp/account           get connected account info
  GET  /webhooks/whatsapp          Meta webhook verification
  POST /webhooks/whatsapp          inbound message events
"""
from fastapi import APIRouter, Body, Depends, Header, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.dependencies.workspace import WorkspaceContext, get_workspace_context, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.models.identity import User
from app.schemas.whatsapp import ConnectWhatsAppRequest, WhatsAppAccountResponse
from app.services import whatsapp_service, webhook_service

router = APIRouter(tags=["whatsapp"])
webhook_router = APIRouter(tags=["webhooks"])


@router.post("/whatsapp/connect", response_model=WhatsAppAccountResponse, status_code=201)
async def connect(
    payload: ConnectWhatsAppRequest,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    account = await whatsapp_service.connect_account(db, ctx.workspace.id, payload)
    return WhatsAppAccountResponse.model_validate(account)


@router.delete("/whatsapp/disconnect", status_code=204)
async def disconnect(
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
):
    await whatsapp_service.disconnect_account(db, ctx.workspace.id)


@router.get("/whatsapp/account", response_model=WhatsAppAccountResponse | None)
async def get_account(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    account = await whatsapp_service.get_account(db, ctx.workspace.id)
    if account is None:
        return None
    return WhatsAppAccountResponse.model_validate(account)


# ---- Webhook endpoints (no auth — verified by Meta signature) ----

@webhook_router.get("/webhooks/whatsapp")
async def webhook_verify(request: Request):
    """Meta calls this GET to verify the webhook URL."""
    params = dict(request.query_params)
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == settings.META_VERIFY_TOKEN:
        return PlainTextResponse(challenge or "")
    return PlainTextResponse("Forbidden", status_code=403)


@webhook_router.post("/webhooks/whatsapp", status_code=200)
async def webhook_receive(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Meta posts all inbound events here."""
    body = await request.body()

    print("🔥 WEBHOOK HIT")
    print(body.decode())
    
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not webhook_service.verify_webhook_signature(body, signature):
        return PlainTextResponse("Forbidden", status_code=403)

    payload = await request.json()
    # Process synchronously for now (Celery in production)
    try:
        await webhook_service.handle_inbound(db, payload)
    except Exception as e:
        from app.core.logging import get_logger
        get_logger(__name__).error("webhook_processing_error", error=str(e))

    # Always 200 to Meta — never retry
    return {"status": "ok"}
