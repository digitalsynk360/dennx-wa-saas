"""
Transactional email via SMTP (stdlib smtplib in thread executor).
Configure SMTP_* and FROM_EMAIL in backend/.env.

In development, if SMTP_HOST is empty, emails are logged instead of
sent — so signup/password-reset flows work locally without SMTP setup.
"""
import asyncio
import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.core.logging import get_logger
from app.services.email_templates import EmailTemplates

logger = get_logger(__name__)


def _send_sync(to_email: str, subject: str, html_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"]    = settings.FROM_EMAIL or "no-reply@limbu.ai"
    msg["To"]      = to_email
    msg.set_content("This email requires an HTML-capable client.")
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)


async def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """
    Core send function. Returns True on success, False on failure.
    If SMTP_HOST not set → logs email (dev mode).
    """
    if not settings.SMTP_HOST:
        logger.info(
            "email_dev_mode_log",
            to=to_email,
            subject=subject,
            preview=html_body[:200],
        )
        return False
    try:
        await asyncio.to_thread(_send_sync, to_email, subject, html_body)
        logger.info("email_sent", to=to_email, subject=subject)
        return True
    except Exception as e:
        logger.error("email_send_failed", to=to_email, error=str(e))
        return False


# ── Original functions (kept for backward compat) ──────────────────────

async def send_verification_email(to_email: str, token: str) -> None:
    """Called from auth_service on signup."""
    app_url = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    verify_url = f"{app_url}/verify-email?token={token}"
    await send_email(
        to_email,
        "Verify your Limbu WA SaaS account",
        EmailTemplates.verify_email("there", verify_url),
    )


async def send_password_reset_email(to_email: str, token: str) -> None:
    """Called from auth_service on forgot password."""
    app_url = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{app_url}/reset-password?token={token}"
    await send_email(
        to_email,
        "Reset your Limbu WA SaaS password",
        EmailTemplates.forgot_password("there", reset_url),
    )


# ── New rich template methods ───────────────────────────────────────────

async def send_welcome(to_email: str, full_name: str) -> bool:
    app_url = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    return await send_email(
        to_email,
        "Welcome to Limbu WA SaaS!",
        EmailTemplates.welcome(full_name, app_url),
    )


async def send_verify_email(to_email: str, full_name: str, token: str) -> bool:
    app_url   = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    verify_url = f"{app_url}/verify-email?token={token}"
    return await send_email(
        to_email,
        "Verify your email address",
        EmailTemplates.verify_email(full_name, verify_url),
    )


async def send_forgot_password(to_email: str, full_name: str, token: str) -> bool:
    app_url   = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{app_url}/reset-password?token={token}"
    return await send_email(
        to_email,
        "Reset your password",
        EmailTemplates.forgot_password(full_name, reset_url),
    )


async def send_password_reset_success(to_email: str, full_name: str) -> bool:
    app_url = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    return await send_email(
        to_email,
        "Your password has been reset",
        EmailTemplates.password_reset_success(full_name, app_url),
    )


async def send_workspace_invitation(
    to_email: str,
    invitee_name: str,
    inviter_name: str,
    workspace_name: str,
    role: str,
    token: str,
) -> bool:
    app_url    = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    accept_url = f"{app_url}/invite/accept?token={token}"
    return await send_email(
        to_email,
        f"You're invited to join {workspace_name}",
        EmailTemplates.workspace_invitation(
            invitee_name, inviter_name, workspace_name, role, accept_url
        ),
    )


async def send_subscription_expiry(
    to_email: str,
    full_name: str,
    workspace_name: str,
    expiry_date: str,
    plan: str,
) -> bool:
    app_url     = getattr(settings, "APP_URL", None) or getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    upgrade_url = f"{app_url}/billing"
    return await send_email(
        to_email,
        f"Your {plan} plan expires soon",
        EmailTemplates.subscription_expiry(
            full_name, workspace_name, expiry_date, plan, upgrade_url
        ),
    )


async def send_invoice(
    to_email: str,
    full_name: str,
    invoice_number: str,
    amount: str,
    plan: str,
    period: str,
    invoice_url: str,
) -> bool:
    return await send_email(
        to_email,
        f"Invoice #{invoice_number} — {plan} Plan",
        EmailTemplates.invoice(
            full_name, invoice_number, amount, plan, period, invoice_url
        ),
    )