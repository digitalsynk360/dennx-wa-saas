"""
Central application configuration. Every value is read from the
environment (or a local .env in development) via pydantic-settings.
No secret is ever hardcoded — see /.env.example at the repo root.
"""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ---------- Application ----------
    APP_NAME: str = "Limbu WA SaaS"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True

    # ---------- Database ----------
    DATABASE_URL: str          # async (asyncpg) — FastAPI runtime
    DATABASE_URL_SYNC: str     # sync (psycopg3) — Alembic + Celery
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE: int = 300

    # ---------- Redis / Celery ----------
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ---------- JWT ----------
    JWT_SECRET_KEY: str
    JWT_REFRESH_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ---------- Encryption ----------
    FIELD_ENCRYPTION_KEY: str

    # ---------- Meta / WhatsApp ----------
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""
    META_SYSTEM_USER_TOKEN: str = ""
    META_VERIFY_TOKEN: str = ""
    META_EMBEDDED_SIGNUP_CONFIG_ID: str = ""
    META_GRAPH_API_VERSION: str = "v21.0"

    # Phase 7 — campaign send pacing (Meta Cloud API throughput tiers)
    CAMPAIGN_SEND_RATE_PER_SECOND: int = 1

    # ---------- AI ----------
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    AI_DEFAULT_PROVIDER: Literal["openai", "anthropic"] = "openai"

    # ---------- Email ----------
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = ""
    FROM_NAME: str = "Limbu WA SaaS"
    APP_URL: str = "http://localhost:3000"

    # ---------- CORS ----------
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"
    DOMAIN_NAME: str = ""

    @property
    def graph_api_base(self) -> str:
        return f"https://graph.facebook.com/{self.META_GRAPH_API_VERSION}"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
