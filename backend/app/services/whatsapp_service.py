"""
WhatsApp account management service.

Connect flow (manual credentials — Settings page):
  1. User enters WABA ID, Phone Number ID, display number, business
     name and access token in the Settings → Auth & WhatsApp page.
  2. Backend encrypts the token, saves the account, marks status=live.
  3. Webhook is already configured globally on Meta App Dashboard
     pointing at /api/v1/webhooks/whatsapp.

Incoming messages are processed by webhook_service.py.
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.encryption import decrypt_value, encrypt_value
from app.models.whatsapp import WhatsAppAccount
from app.repositories.whatsapp_repository import WhatsAppRepository
from app.schemas.whatsapp import ConnectWhatsAppRequest


async def connect_account(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    payload: ConnectWhatsAppRequest,
) -> WhatsAppAccount:
    repo = WhatsAppRepository(db)

    existing = await repo.get_by_workspace(workspace_id)
    if existing:
        # Update in place
        existing.waba_id = payload.waba_id
        existing.phone_number_id = payload.phone_number_id
        existing.display_phone_number = payload.display_phone_number
        existing.verified_business_name = payload.business_name
        existing.access_token_encrypted = encrypt_value(payload.access_token)
        existing.status = "live"
        existing.connected_at = datetime.now(timezone.utc)
        await db.flush()
        return existing

    account = WhatsAppAccount(
        workspace_id=workspace_id,
        waba_id=payload.waba_id,
        phone_number_id=payload.phone_number_id,
        display_phone_number=payload.display_phone_number,
        verified_business_name=payload.business_name,
        access_token_encrypted=encrypt_value(payload.access_token),
        status="live",
        connected_at=datetime.now(timezone.utc),
    )
    await repo.add(account)
    return account


async def disconnect_account(db: AsyncSession, workspace_id: uuid.UUID) -> None:
    repo = WhatsAppRepository(db)
    account = await repo.get_by_workspace(workspace_id)
    if account is None:
        raise HTTPException(status_code=404, detail="No WhatsApp account connected.")
    account.status = "disconnected"
    account.access_token_encrypted = None
    await db.flush()


async def get_account(db: AsyncSession, workspace_id: uuid.UUID) -> WhatsAppAccount | None:
    repo = WhatsAppRepository(db)
    return await repo.get_by_workspace(workspace_id)


def get_decrypted_token(account: WhatsAppAccount) -> str:
    if not account.access_token_encrypted:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WhatsApp account has no access token.",
        )
    return decrypt_value(account.access_token_encrypted)
