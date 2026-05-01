"""
Authentication router.

Endpoints:
    POST /auth/login  — validate credentials, return JWT
    POST /auth/logout — client-side only, server returns acknowledgement

All responses wrapped in { "data": {...} } per API contract.
No server-side session state — JWT is stateless (FR-MR-01.8).
"""

from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Validate email/password and return JWT token.

    Returns { "data": { token, user, expires_at } }.
    Returns 401 for any invalid credential (intentionally vague).
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

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
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_expiry_days
    )

    return {
        "data": {
            "token": token,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "role": user.role.value,
            },
            "expires_at": expires_at.isoformat(),
        }
    }


@router.post("/logout")
async def logout(
    _current_user: User = Depends(get_current_user),
) -> dict:
    """
    Acknowledge logout. No server state to clear — token removal is client-side.
    """
    return {"data": {"message": "Logged out"}}