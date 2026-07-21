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


# Meta's documented per-24h unique-recipient caps by messaging tier
# (2026 rollout: verified accounts can jump straight to 100K; TIER_250
# stays the unverified-account floor). Used to compute a safe daily
# send volume so large campaigns pace themselves instead of blasting
# past the account's real capacity and tanking the quality rating.
TIER_LIMITS = {
    "TIER_250": 250,
    "TIER_1K": 1_000,
    "TIER_2K": 2_000,
    "TIER_10K": 10_000,
    "TIER_100K": 100_000,
    "TIER_UNLIMITED": 1_000_000,
}
DEFAULT_TIER_LIMIT = 250  # conservative floor when tier is unknown/unsynced


def _tier_limit_from_code(tier: str) -> int | None:
    """Parses the numeric ceiling straight out of Meta's TIER_xxx
    code (e.g. "TIER_2K" -> 2000, "TIER_250" -> 250, "TIER_100K" ->
    100000) as a fallback when the exact code isn't in TIER_LIMITS.
    Meta's tier ladder has changed shape more than once (250→1K→10K→
    100K in some docs, 250→2K→10K→100K in the live UI) and different
    accounts/regions can see different rungs — parsing the code
    directly means a rung we haven't hardcoded yet still resolves
    correctly instead of silently falling back to the ultra-
    conservative 250 default."""
    import re

    if tier.upper() == "TIER_UNLIMITED":
        return 1_000_000
    m = re.match(r"TIER_(\d+)(K|M)?$", tier.upper())
    if not m:
        return None
    n = int(m.group(1))
    if m.group(2) == "K":
        n *= 1_000
    elif m.group(2) == "M":
        n *= 1_000_000
    return n


async def refresh_account_health(db: AsyncSession, account: WhatsAppAccount) -> WhatsAppAccount:
    """Pulls live quality_rating + messaging limit from Meta and
    persists them on the account row, so campaign pre-flight checks
    and the dashboard don't need a fresh API call every time. Never
    raises — on any failure the existing (possibly stale) DB values
    are left untouched and used as-is.

    NOTE: Meta deprecated the `messaging_limit_tier` field (May 2026)
    in favor of `whatsapp_business_manager_messaging_limit` — same
    TIER_xxx string values, different field name to request."""
    import httpx

    if not account.phone_number_id:
        return account
    try:
        token = get_decrypted_token(account)
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{settings.graph_api_base}/{account.phone_number_id}",
                params={"fields": "quality_rating,whatsapp_business_manager_messaging_limit"},
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code == 200:
            data = r.json()
            if data.get("quality_rating"):
                account.quality_rating = data["quality_rating"]
            tier = data.get("whatsapp_business_manager_messaging_limit")
            if tier:
                account.messaging_limit_tier = tier
            await db.flush()
    except Exception:
        pass
    return account


def daily_send_cap(account: WhatsAppAccount) -> int:
    """Safe number of NEW sends to make in a ~24h window — 80% of the
    account's tier ceiling, so normal reply/service traffic and any
    margin for error always has headroom and the account never rides
    right at the edge of its limit."""
    tier = account.messaging_limit_tier or ""
    limit = TIER_LIMITS.get(tier) or _tier_limit_from_code(tier) or DEFAULT_TIER_LIMIT
    return max(int(limit * 0.8), 50)