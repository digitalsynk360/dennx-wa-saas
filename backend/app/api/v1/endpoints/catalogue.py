"""
Product Catalogue endpoints. Mounted at /api/v1/catalogue.

  GET    /catalogue/categories              list categories
  POST   /catalogue/categories              create category
  PATCH  /catalogue/categories/{id}         update category
  DELETE /catalogue/categories/{id}         delete category

  GET    /catalogue/products                list products (filter by category, search)
  POST   /catalogue/products                create product
  PATCH  /catalogue/products/{id}           update product
  DELETE /catalogue/products/{id}           delete product
  PATCH  /catalogue/products/{id}/toggle    toggle active
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.models.catalogue import Product, ProductCategory

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


# ─── Schemas ────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    description: str | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    sort_order: int
    created_at: datetime


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price: int = 0
    currency: str = "INR"
    sku: str | None = None
    image_url: str | None = None
    stock: int | None = None
    category_id: uuid.UUID | None = None
    is_active: bool = True


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: int | None = None
    currency: str | None = None
    sku: str | None = None
    image_url: str | None = None
    stock: int | None = None
    category_id: uuid.UUID | None = None
    is_active: bool | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    price: int
    currency: str
    sku: str | None
    image_url: str | None
    stock: int | None
    is_active: bool
    category_id: uuid.UUID | None
    category_name: str | None = None
    created_at: datetime


def _product_resp(p: Product) -> ProductResponse:
    return ProductResponse(
        id=p.id, name=p.name, description=p.description,
        price=p.price, currency=p.currency, sku=p.sku,
        image_url=p.image_url, stock=p.stock, is_active=p.is_active,
        category_id=p.category_id,
        category_name=p.category.name if p.category else None,
        created_at=p.created_at,
    )


# ─── Categories ─────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(
    ctx: WorkspaceContext = Depends(require_permission("contacts.read")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ProductCategory)
        .where(ProductCategory.workspace_id == ctx.workspace.id)
        .order_by(ProductCategory.sort_order, ProductCategory.name)
    )
    return [CategoryResponse.model_validate(c) for c in res.scalars()]


@router.post("/categories", response_model=CategoryResponse, status_code=201)
async def create_category(
    payload: CategoryCreate,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    cat = ProductCategory(workspace_id=ctx.workspace.id, **payload.model_dump())
    db.add(cat)
    await db.flush()
    return CategoryResponse.model_validate(cat)


@router.patch("/categories/{cat_id}", response_model=CategoryResponse)
async def update_category(
    cat_id: uuid.UUID,
    payload: CategoryUpdate,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ProductCategory).where(
            ProductCategory.id == cat_id,
            ProductCategory.workspace_id == ctx.workspace.id,
        )
    )
    cat = res.scalar_one_or_none()
    if cat is None:
        from fastapi import HTTPException
        raise HTTPException(404, "Category not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.flush()
    return CategoryResponse.model_validate(cat)


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(
    cat_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ProductCategory).where(
            ProductCategory.id == cat_id,
            ProductCategory.workspace_id == ctx.workspace.id,
        )
    )
    cat = res.scalar_one_or_none()
    if cat:
        await db.delete(cat)


# ─── Products ────────────────────────────────────────────────────────────────

@router.get("/products", response_model=list[ProductResponse])
async def list_products(
    search: str = Query("", max_length=100),
    category_id: uuid.UUID | None = None,
    active_only: bool = False,
    ctx: WorkspaceContext = Depends(require_permission("contacts.read")),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Product)
        .where(Product.workspace_id == ctx.workspace.id)
        .order_by(Product.name)
    )
    if search:
        stmt = stmt.where(Product.name.ilike(f"%{search}%"))
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if active_only:
        stmt = stmt.where(Product.is_active == True)  # noqa: E712
    res = await db.execute(stmt)
    return [_product_resp(p) for p in res.scalars()]


@router.post("/products", response_model=ProductResponse, status_code=201)
async def create_product(
    payload: ProductCreate,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    p = Product(workspace_id=ctx.workspace.id, **payload.model_dump())
    db.add(p)
    await db.flush()
    await db.refresh(p)
    return _product_resp(p)


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.workspace_id == ctx.workspace.id,
        )
    )
    p = res.scalar_one_or_none()
    if p is None:
        from fastapi import HTTPException
        raise HTTPException(404, "Product not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.flush()
    await db.refresh(p)
    return _product_resp(p)


@router.patch("/products/{product_id}/toggle", response_model=ProductResponse)
async def toggle_product(
    product_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.workspace_id == ctx.workspace.id,
        )
    )
    p = res.scalar_one_or_none()
    if p is None:
        from fastapi import HTTPException
        raise HTTPException(404, "Product not found")
    p.is_active = not p.is_active
    await db.flush()
    await db.refresh(p)
    return _product_resp(p)


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(
    product_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("contacts.write")),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.workspace_id == ctx.workspace.id,
        )
    )
    p = res.scalar_one_or_none()
    if p:
        await db.delete(p)