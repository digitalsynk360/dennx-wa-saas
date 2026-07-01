"""
Simple Redis-backed fixed-window rate limiter, used to throttle
sensitive auth endpoints (login, forgot-password, resend-verification)
against brute force / abuse.
"""
from fastapi import HTTPException, Request, status

from app.core.redis import redis_client


async def rate_limit(
    request: Request,
    key_prefix: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Raises 429 if the caller has exceeded `limit` calls in the
    current `window_seconds` window. Keyed by client IP + key_prefix."""
    client_ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:{key_prefix}:{client_ip}"

    current = await redis_client.incr(key)
    if current == 1:
        await redis_client.expire(key, window_seconds)

    if current > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
