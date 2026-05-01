"""
JWT authentication utilities and FastAPI dependency functions.

Provides:
- Token creation and decoding
- get_current_user: validates JWT from Authorization header
- require_adjuster: enforces adjuster-only access
- require_hq: enforces HQ-only access
- require_any: accepts both roles (used for [both] endpoints)
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

bearer_scheme = HTTPBearer()


def create_access_token(user_id: UUID, email: str, role: str) -> str:
    """
    Create a signed JWT token for the given user.

    Token payload includes user_id, email, role, and expiry.
    Expiry is 7 days from issue time (FR-MR-01.6).
    """
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_expiry_days
    )
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def decode_token(token: str) -> dict:
    """
    Decode and validate JWT without HTTPBearer dependency.
    Used by WebSocket endpoint — WS connections cannot set Authorization headers.
    Raises JWTError if token is invalid or expired.
    """
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validate JWT token and return the authenticated user.

    Raises 401 if token is missing, expired, or invalid.
    Raises 401 if user no longer exists in database.
    """
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    return user


async def require_adjuster(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Enforce adjuster-only access. Raises 403 if user is HQ.

    Use as a FastAPI dependency on [adjuster] endpoints.
    """
    if current_user.role != "adjuster":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Adjuster access required",
        )
    return current_user


async def require_hq(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Enforce HQ-only access. Raises 403 if user is adjuster.

    Use as a FastAPI dependency on [hq] endpoints.
    """
    if current_user.role != "hq":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HQ access required",
        )
    return current_user


# Alias for [both] endpoints — same as get_current_user but named
# explicitly for clarity in router signatures
require_any = get_current_user
