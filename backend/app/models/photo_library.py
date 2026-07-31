"""
Business Photo Library — Option 1 of the itinerary-photo sourcing
chain. Lets a workspace upload its OWN photos (their actual houseboat,
their actual property, their actual destination shots) tagged with
keywords (e.g. "Kashmir", "Dal Lake", "Goa Beach"). The AI itinerary
tool checks this library FIRST before falling back to Unsplash
(Option 2) or going photo-less (Option 3) — see
ai_tools.py::_find_day_photo for the priority chain.

Stored directly in Postgres as bytes (no S3/CDN in this project's
infra) — fine at the scale a photo library realistically needs
(dozens to low hundreds of images per workspace, each a few hundred
KB after the size cap below).
"""
from sqlalchemy import LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class BusinessPhoto(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "business_photos"

    tag: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. "Kashmir Dal Lake"
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False, default="image/jpeg")
    image_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False, default=0)