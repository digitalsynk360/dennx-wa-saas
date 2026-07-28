"""Public-facing lead capture — replaces open self-signup. Visitors
submit their details on /demo; the platform admin reviews these in
Superadmin > Demo Requests and creates the account manually (see
app/api/v1/endpoints/admin.py's create_user_admin) once a plan is
agreed. Not tenant-scoped — these leads don't belong to a workspace
yet."""
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class DemoRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "demo_requests"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    business_type: Mapped[str | None] = mapped_column(String(128))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="new", nullable=False)  # new|contacted|converted|rejected
    admin_notes: Mapped[str | None] = mapped_column(Text)
    contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))