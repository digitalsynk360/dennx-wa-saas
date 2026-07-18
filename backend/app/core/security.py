"""
Password hashing and JWT token creation/verification.

Two separate signing keys are used for access vs refresh tokens
(JWT_SECRET_KEY / JWT_REFRESH_SECRET_KEY) so a leaked refresh secret
cannot be used to forge access tokens and vice versa.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi.concurrency import run_in_threadpool
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    """Synchronous — kept for non-request contexts (scripts, seeds)."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Synchronous — kept for non-request contexts (scripts, seeds)."""
    return pwd_context.verify(plain_password, hashed_password)


async def hash_password_async(password: str) -> str:
    """Bcrypt is CPU-bound and takes ~250-300ms per call. Called
    directly (not awaited) inside an async endpoint, it blocks the
    ENTIRE event loop for that duration — every other concurrent
    request on that worker (unrelated users, unrelated endpoints)
    stalls until it's done. Offloading to FastAPI's threadpool lets
    other requests keep being served concurrently while this runs."""
    return await run_in_threadpool(pwd_context.hash, password)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    return await run_in_threadpool(pwd_context.verify, plain_password, hashed_password)


def _secret_for(token_type: TokenType) -> str:
    return (
        settings.JWT_SECRET_KEY
        if token_type == "access"
        else settings.JWT_REFRESH_SECRET_KEY
    )


def create_token(
    subject: str,
    token_type: TokenType,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    if token_type == "access":
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, _secret_for(token_type), algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, token_type: TokenType) -> dict[str, Any]:
    """Raises jose.JWTError if invalid, expired, or wrong type."""
    payload = jwt.decode(
        token, _secret_for(token_type), algorithms=[settings.JWT_ALGORITHM]
    )
    if payload.get("type") != token_type:
        raise JWTError("Unexpected token type")
    return payload


def create_token_pair(user_id: uuid.UUID) -> tuple[str, str]:
    """Returns (access_token, refresh_token)."""
    sub = str(user_id)
    return create_token(sub, "access"), create_token(sub, "refresh")