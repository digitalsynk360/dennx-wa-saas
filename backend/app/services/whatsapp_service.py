"""
WhatsApp account management service.

Primary connect flow — Meta Embedded Signup (Settings → WhatsApp):
  1. Frontend loads the Facebook JS SDK and opens the Embedded Signup
     popup with our META_EMBEDDED_SIGNUP_CONFIG_ID.
  2. Customer picks/creates their Meta Business Portfolio + WABA +
     phone number inside Meta's own popup UI — never on our site.
  3. On completion, Meta hands the popup's opener window two things:
       - an exchangeable `code` (via the FB.login callback)
       - `waba_id` + `phone_number_id` (via window.postMessage,
         event type "WA_EMBEDDED_SIGNUP")
  4. Frontend POSTs both to /whatsapp/embedded-signup/complete.
  5. This service does the server-to-server work Meta requires:
       a. exchange the code for a customer-scoped access token
       b. register the phone number for Cloud API use
       c. subscribe our app to webhooks on the customer's WABA
       d. fetch the verified display number / business name
       e. encrypt + store everything

  The customer never sees or types an App ID, App Secret, access
  token, WABA ID or phone number ID at any point.

A manual fallback (ConnectWhatsAppRequest / connect_account) is kept
for support/recovery use only — it is not exposed in the normal
onboarding UI.

Incoming messages are processed by webhook_service.py.
"""
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.encryption import decrypt_value, encrypt_value
from app.core.logging import get_logger
from app.models.whatsapp import WhatsAppAccount
from app.repositories.whatsapp_repository import WhatsAppRepository
from app.schemas.whatsapp import ConnectWhatsAppRequest, EmbeddedSignupCompleteRequest

logger = get_logger(__name__)


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


async def complete_embedded_signup(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    payload: EmbeddedSignupCompleteRequest,
) -> WhatsAppAccount:
    """The real, one-click Meta Embedded Signup completion — see the
    module docstring for the full flow. Every Graph API call here is
    server-to-server; the customer's browser only ever talks to Meta
    directly (never sees our App Secret)."""
    if not settings.META_APP_ID or not settings.META_APP_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Meta Tech Provider app is not configured on the server (META_APP_ID / META_APP_SECRET).",
        )

    async with httpx.AsyncClient(timeout=20) as client:
        # ── 1) Exchange the one-time code for a customer-scoped access token ──
        # This token belongs to the CUSTOMER's WABA (granted via the
        # signup consent screen) — it's what every subsequent call
        # below, and every future message send for this workspace,
        # authenticates with.
        exchange_resp = await client.get(
            f"{settings.graph_api_base}/oauth/access_token",
            params={
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "code": payload.code,
            },
        )
        if exchange_resp.status_code != 200:
            logger.error("embedded_signup_code_exchange_failed", body=exchange_resp.text)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Meta rejected the signup code — please try connecting again.",
            )
        access_token = exchange_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=502, detail="Meta did not return an access token.")

        auth_headers = {"Authorization": f"Bearer {access_token}"}

        # ── 2) Fetch the verified display number + business name ──
        display_phone_number: str | None = None
        verified_business_name: str | None = None
        info_resp = await client.get(
            f"{settings.graph_api_base}/{payload.phone_number_id}",
            params={"fields": "display_phone_number,verified_name,quality_rating"},
            headers=auth_headers,
        )
        quality_rating = None
        if info_resp.status_code == 200:
            info = info_resp.json()
            display_phone_number = info.get("display_phone_number")
            verified_business_name = info.get("verified_name")
            quality_rating = info.get("quality_rating")
        else:
            logger.warning("embedded_signup_phone_info_failed", body=info_resp.text)

        # ── 3) Register the phone number for Cloud API use ──
        # Required before the number can send/receive via the Cloud
        # API. A fresh number from Embedded Signup needs a 2-step
        # verification PIN set the first time — we generate one
        # since the customer is never asked for it. If it's already
        # registered (common when re-connecting, or when the number
        # came from the WhatsApp Business App migration path), Meta
        # returns an error we can safely ignore.
        import secrets
        pin = f"{secrets.randbelow(1_000_000):06d}"
        register_resp = await client.post(
            f"{settings.graph_api_base}/{payload.phone_number_id}/register",
            json={"messaging_product": "whatsapp", "pin": pin},
            headers=auth_headers,
        )
        if register_resp.status_code != 200:
            logger.info("embedded_signup_register_skipped_or_failed", body=register_resp.text[:300])

        # ── 4) Subscribe our app to webhooks on the customer's WABA ──
        # Without this, Meta never sends inbound messages / status
        # updates to our webhook for this customer.
        sub_resp = await client.post(
            f"{settings.graph_api_base}/{payload.waba_id}/subscribed_apps",
            headers=auth_headers,
        )
        webhook_subscribed = sub_resp.status_code == 200
        if not webhook_subscribed:
            logger.error("embedded_signup_webhook_subscribe_failed", body=sub_resp.text)

    # ── 5) Persist — same upsert pattern as the manual connect path ──
    repo = WhatsAppRepository(db)
    existing = await repo.get_by_workspace(workspace_id)
    now = datetime.now(timezone.utc)

    if existing:
        existing.waba_id = payload.waba_id
        existing.phone_number_id = payload.phone_number_id
        existing.display_phone_number = display_phone_number
        existing.verified_business_name = verified_business_name
        existing.access_token_encrypted = encrypt_value(access_token)
        existing.quality_rating = quality_rating
        existing.status = "live"
        existing.webhook_subscribed = webhook_subscribed
        existing.connected_at = now
        await db.flush()
        account = existing
    else:
        account = WhatsAppAccount(
            workspace_id=workspace_id,
            waba_id=payload.waba_id,
            phone_number_id=payload.phone_number_id,
            display_phone_number=display_phone_number,
            verified_business_name=verified_business_name,
            access_token_encrypted=encrypt_value(access_token),
            quality_rating=quality_rating,
            status="live",
            webhook_subscribed=webhook_subscribed,
            connected_at=now,
        )
        await repo.add(account)

    logger.info(
        "embedded_signup_completed",
        workspace_id=str(workspace_id), waba_id=payload.waba_id,
        webhook_subscribed=webhook_subscribed,
    )
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