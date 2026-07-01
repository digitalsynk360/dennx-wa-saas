"""
Authentication endpoints — mounted at /api/v1/auth.

  POST /auth/signup            create user + first workspace, returns tokens
  POST /auth/login              returns tokens
  POST /auth/refresh             rotate access token using a refresh token
  POST /auth/logout              client-side token discard (stateless JWT)
  GET  /auth/me                  current user + their workspaces
  POST /auth/verify-email        consume email verification token
  POST /auth/forgot-password     request a password reset email
  POST /auth/reset-password      consume reset token, set new password
  POST /auth/change-password     change password while logged in
"""
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.rate_limit import rate_limit
from app.models.identity import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    TokenPairResponse,
    UserResponse,
    VerifyEmailRequest,
    WorkspaceSummary,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request: Request,
    payload: SignupRequest,
    db: AsyncSession = Depends(get_db),
) -> SignupResponse:
    await rate_limit(request, "signup", limit=5, window_seconds=60)

    user, workspace, role_name, tokens = await auth_service.signup(db, payload)
    return SignupResponse(
        user=UserResponse.model_validate(user),
        workspace=WorkspaceSummary(
            id=workspace.id, name=workspace.name, slug=workspace.slug,
            plan=workspace.plan, role=role_name,
        ),
        tokens=tokens,
    )


@router.post("/login", response_model=TokenPairResponse)
async def login(
    request: Request,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    await rate_limit(request, "login", limit=10, window_seconds=60)

    _, tokens = await auth_service.login(db, payload)
    return tokens


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    return await auth_service.refresh_tokens(db, payload.refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(_: User = Depends(get_current_user)) -> MessageResponse:
    # JWTs are stateless; the frontend discards both tokens. A token
    # denylist (Redis) can be added here later if instant revocation
    # becomes a requirement.
    return MessageResponse(message="Logged out.")


@router.get("/me", response_model=MeResponse)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    workspaces = await auth_service.list_user_workspaces(db, current_user.id)
    return MeResponse(user=UserResponse.model_validate(current_user), workspaces=workspaces)


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    payload: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await auth_service.verify_email(db, payload.token)
    return MessageResponse(message="Email verified successfully.")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await rate_limit(request, "forgot-password", limit=5, window_seconds=300)

    await auth_service.request_password_reset(db, payload.email)
    return MessageResponse(
        message="If an account exists for this email, a reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await auth_service.reset_password(db, payload.token, payload.new_password)
    return MessageResponse(message="Password reset successfully. You can now log in.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await auth_service.change_password(
        db, current_user, payload.current_password, payload.new_password
    )
    return MessageResponse(message="Password changed successfully.")
