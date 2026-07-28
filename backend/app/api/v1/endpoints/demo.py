"""
Public demo-request lead capture. Mounted at /api/v1/demo.
No authentication — this is the public-facing replacement for open
self-signup. Submissions are reviewed in Superadmin > Demo Requests.

  POST /demo   submit a demo request (public)
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.lead import DemoRequest

router = APIRouter(prefix="/demo", tags=["demo"])


class CreateDemoRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    business_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=6, max_length=32)
    email: EmailStr
    business_type: str | None = Field(default=None, max_length=128)
    message: str | None = Field(default=None, max_length=2000)


@router.post("", status_code=201)
async def submit_demo_request(
    payload: CreateDemoRequest,
    db: AsyncSession = Depends(get_db),
):
    lead = DemoRequest(
        full_name=payload.full_name,
        business_name=payload.business_name,
        phone=payload.phone,
        email=str(payload.email),
        business_type=payload.business_type,
        message=payload.message,
    )
    db.add(lead)
    await db.flush()
    return {"ok": True, "message": "Thank you! We'll get back to you shortly."}