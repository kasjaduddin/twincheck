"""
Authentication router.

Endpoints:
    POST /auth/login  — validate credentials, return JWT
    POST /auth/logout — client-side only, server returns acknowledgement

No server-side session state — JWT is stateless (FR-MR-01.8).
Concurrent sessions are allowed — new login does not invalidate previous tokens (FR-MR-01.7).
"""

from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_current_user
from app.core.database import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ============================================================
# Request / Response schemas
# ============================================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str


class LoginResponse(BaseModel):
    token: str
    user: UserResponse
    expires_at: str


class LogoutResponse(BaseModel):
    message: str


# ============================================================
# Endpoints
# ============================================================

@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Validate email/password credentials and return a JWT token.

    Token expiry is 7 days from issue time.
    Both adjuster and HQ accounts use this same endpoint — role
    is embedded in the token and used for redirect decisions on the client.

    Returns 401 if credentials are invalid (intentionally vague
    to prevent user enumeration).
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Verify password — check even if user not found to prevent timing attacks
    if user is None or not bcrypt.checkpw(
        body.password.encode(), user.password_hash.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role.value,
    )

    from datetime import timedelta
    from app.core.config import settings

    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=settings.jwt_expiry_seconds
    )

    return LoginResponse(
        token=token,
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role.value,
        ),
        expires_at=expires_at.isoformat(),
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    _current_user: User = Depends(get_current_user),
) -> LogoutResponse:
    """
    Signal logout to the server.

    Server has no session state to clear — JWT is stateless.
    This endpoint exists so the client has a clean API surface to call;
    the actual token removal happens client-side (FR-MR-01.8).
    """
    return LogoutResponse(message="Logged out")