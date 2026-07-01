"""
Developer API key service — Phase 13.

Keys are generated as `lwa_live_<32 random hex chars>`. Only a bcrypt
hash and a short prefix (for display/identification, e.g.
`lwa_live_a1b2`) are persisted — the full key is shown to the user
exactly once, at creation time, matching standard practice (Stripe,
GitHub PATs, etc.).
"""
import secrets
import uuid

from fastapi import HTTPException
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey
from app.repositories.api_key_repository import ApiKeyRepository

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

KEY_PREFIX = "lwa_live_"


async def list_keys(db: AsyncSession, workspace_id: uuid.UUID) -> list[ApiKey]:
    repo = ApiKeyRepository(db)
    return await repo.list_by_workspace(workspace_id)


async def create_key(db: AsyncSession, workspace_id: uuid.UUID, name: str) -> tuple[ApiKey, str]:
    raw_secret = secrets.token_hex(16)
    full_key = f"{KEY_PREFIX}{raw_secret}"
    display_prefix = f"{KEY_PREFIX}{raw_secret[:8]}"

    key = ApiKey(
        workspace_id=workspace_id,
        name=name,
        key_hash=pwd_context.hash(full_key),
        key_prefix=display_prefix,
        is_active=True,
    )
    repo = ApiKeyRepository(db)
    await repo.add(key)
    return key, full_key


async def revoke_key(db: AsyncSession, workspace_id: uuid.UUID, key_id: uuid.UUID) -> None:
    repo = ApiKeyRepository(db)
    key = await repo.get_by_id(key_id)
    if key is None or key.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="API key not found.")
    await repo.delete(key)
