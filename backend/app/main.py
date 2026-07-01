"""
FastAPI application entrypoint.

Local dev:  uvicorn app.main:app --reload --port 8000
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import configure_logging, get_logger
from app.core.redis import redis_client
from app.utils.rbac_seed import ensure_rbac_seed

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    await redis_client.ping()

    # Idempotent — seeds Admin/Manager/Agent roles + permissions on
    # first run, no-op afterwards.
    async with AsyncSessionLocal() as session:
        await ensure_rbac_seed(session)
        await session.commit()

    logger.info("startup", environment=settings.ENVIRONMENT)
    yield
    await redis_client.aclose()
    logger.info("shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    default_response_class=ORJSONResponse,
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# Frontend runs separately (Next.js dev server on :3000) — CORS is
# required since frontend and backend are fully decoupled.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/api/health", tags=["system"])
async def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
