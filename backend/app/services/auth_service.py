"""
Authentication use cases: signup, login, token refresh, email
verification, password reset/change.

On signup, a new Workspace is created and the user is added as its
first member with the "Admin" role (RBAC seed must have run —
see app.utils.rbac_seed, invoked from main.py lifespan).

Single-use tokens for email verification and password reset are
stored in Redis with a TTL (not in PostgreSQL) — simple, automatically
expiring, no extra table needed.
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import redis_client
from app.core.security import (
    create_token_pair,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.identity import User, Workspace, WorkspaceMember
from app.repositories.user_repository import UserRepository
from app.repositories.workspace_repository import (
    RoleRepository,
    WorkspaceRepository,
)
from app.schemas.auth import (
    LoginRequest,
    SignupRequest,
    TokenPairResponse,
    WorkspaceSummary,
)
from app.services.email_service import (
    send_password_reset_email,
    send_verification_email,
    send_welcome,
)
from app.utils.rbac_seed import default_role_name
from app.utils.slug import slugify

EMAIL_VERIFY_TTL_SECONDS = 24 * 3600
PASSWORD_RESET_TTL_SECONDS = 3600


def _redis_key(prefix: str, token: str) -> str:
    return f"{prefix}:{token}"


async def _unique_slug(workspace_repo: WorkspaceRepository, business_name: str) -> str:
    base = slugify(business_name)
    slug = base
    suffix = 1
    while await workspace_repo.slug_exists(slug):
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug


async def signup(db: AsyncSession, payload: SignupRequest) -> tuple[User, Workspace, str, TokenPairResponse]:
    """Creates the user + their first workspace. Returns the user,
    workspace, a raw email-verification token, and a token pair."""
    user_repo = UserRepository(db)
    workspace_repo = WorkspaceRepository(db)
    role_repo = RoleRepository(db)

    if await user_repo.email_exists(payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        full_name=payload.full_name,
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
    )
    await user_repo.add(user)

    admin_role = await role_repo.get_by_name(default_role_name())
    if admin_role is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="RBAC roles are not seeded. Restart the backend.",
        )

    slug = await _unique_slug(workspace_repo, payload.business_name)
    workspace = Workspace(
        name=payload.business_name,
        slug=slug,
        owner_id=user.id,
        plan="free",
    )
    await workspace_repo.add(workspace)

    membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role_id=admin_role.id,
    )
    db.add(membership)
    await db.flush()

    # Issue an email-verification token (single-use, Redis-backed)
    verify_token = uuid.uuid4().hex
    await redis_client.set(
        _redis_key("email_verify", verify_token),
        str(user.id),
        ex=EMAIL_VERIFY_TTL_SECONDS,
    )
    await send_welcome(user.email, user.full_name)
    await send_verification_email(user.email, verify_token)

    access_token, refresh_token = create_token_pair(user.id)

    tokens = TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )

    return user, workspace, admin_role.name, tokens


async def login(db: AsyncSession, payload: LoginRequest) -> tuple[User, TokenPairResponse]:
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(payload.email)

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
    )

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise invalid_credentials

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()

    access_token, refresh_token = create_token_pair(user.id)

    tokens = TokenPairResponse(
      access_token=access_token,
      refresh_token=refresh_token,
    )

    return user, tokens


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> TokenPairResponse:
    from jose import JWTError

    try:
        payload = decode_token(refresh_token, "refresh")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user_id = uuid.UUID(payload["sub"])
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    access_token, refresh_token = create_token_pair(user.id)
    return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)


async def verify_email(db: AsyncSession, token: str) -> None:
    key = _redis_key("email_verify", token)
    user_id_str = await redis_client.get(key)
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(uuid.UUID(user_id_str))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user.email_verified_at = datetime.now(timezone.utc)
    await db.flush()
    await redis_client.delete(key)


async def request_password_reset(db: AsyncSession, email: str) -> None:
    """Always returns success regardless of whether the email exists,
    to avoid leaking which emails are registered."""
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(email)
    if user is None:
        return

    reset_token = uuid.uuid4().hex
    await redis_client.set(
        _redis_key("password_reset", reset_token),
        str(user.id),
        ex=PASSWORD_RESET_TTL_SECONDS,
    )
    await send_password_reset_email(user.email, reset_token)


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    key = _redis_key("password_reset", token)
    user_id_str = await redis_client.get(key)
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(uuid.UUID(user_id_str))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user.hashed_password = hash_password(new_password)
    await db.flush()
    await redis_client.delete(key)
    from app.services.email_service import send_password_reset_success
    await send_password_reset_success(user.email, user.full_name)


async def change_password(
    db: AsyncSession, user: User, current_password: str, new_password: str
) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    user.hashed_password = hash_password(new_password)
    await db.flush()


async def list_user_workspaces(db: AsyncSession, user_id: uuid.UUID) -> list[WorkspaceSummary]:
    workspace_repo = WorkspaceRepository(db)
    pairs = await workspace_repo.list_for_user(user_id)
    return [
        WorkspaceSummary(
            id=ws.id, name=ws.name, slug=ws.slug, plan=ws.plan, role=role_name
        )
        for ws, role_name in pairs
    ]
