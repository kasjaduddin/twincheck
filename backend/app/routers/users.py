"""
Users router — Phase 1.

Implements:
    GET /users/adjusters    [hq] — list all adjusters with active claim count
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_hq
from app.core.database import get_db
from app.models import Claim, User
from app.models.user import ClaimStatus, UserRole

router = APIRouter(prefix="/users", tags=["users"])

# Statuses that count as "active" for workload display
_ACTIVE_STATUSES = [
    ClaimStatus.assigned,
    ClaimStatus.on_site,
    ClaimStatus.completed,
    ClaimStatus.ready_for_review,
    ClaimStatus.under_review,
]


@router.get("/adjusters")
async def list_adjusters(
    _current_user: User = Depends(require_hq),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return all adjusters with their active claim count.
    Used in the HQ assign/reassign modal.
    """
    # Get all adjusters
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.adjuster)
        .order_by(User.name)
    )
    adjusters = result.scalars().all()

    # Count active claims per adjuster in one query
    count_result = await db.execute(
        select(Claim.assigned_to, func.count(Claim.id).label("cnt"))
        .where(
            Claim.assigned_to.in_([a.id for a in adjusters]),
            Claim.status.in_(_ACTIVE_STATUSES),
        )
        .group_by(Claim.assigned_to)
    )
    counts = {str(row.assigned_to): row.cnt for row in count_result}

    return {
        "data": {
            "adjusters": [
                {
                    "id": str(a.id),
                    "name": a.name,
                    "email": a.email,
                    "active_claims_count": counts.get(str(a.id), 0),
                }
                for a in adjusters
            ]
        }
    }
