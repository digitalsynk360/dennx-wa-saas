"""
Product catalogue — workspace-scoped products with image, price, stock.
Used by the Catalogue page and optionally by Flow nodes (send_product).
"""
import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class ProductCategory(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "product_categories"
    __table_args__ = (Index("ix_product_categories_ws", "workspace_id"),)

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    products: Mapped[list["Product"]] = relationship(
        "Product", back_populates="category", lazy="selectin"
    )


class Product(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_ws_active", "workspace_id", "is_active"),
        Index("ix_products_category", "category_id"),
    )

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # paisa (paise)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    sku: Mapped[str | None] = mapped_column(String(64))
    image_url: Mapped[str | None] = mapped_column(String(1024))
    stock: Mapped[int | None] = mapped_column(Integer)  # None = unlimited
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    category: Mapped[ProductCategory | None] = relationship(
        "ProductCategory", back_populates="products", lazy="joined"
    )