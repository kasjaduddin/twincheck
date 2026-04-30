"""
Claims router — Phase 1 endpoints.

Implements:
    GET    /claims                  [both]   — list claims (role-aware)
    GET    /claims/:id              [both]   — single claim detail
    PATCH  /claims/:id/assign       [hq]     — assign adjuster
    PATCH  /claims/:id/reassign     [hq]     — reassign adjuster
    PATCH  /claims/:id/status       [both]   — update status

All responses: { "data": {...} }
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_any, require_hq
from app.core.database import get_db
from app.models import Claim, Policy, User
from app.models.user import ClaimStatus

router = APIRouter(prefix="/claims", tags=["claims"])


# ── Serialization helpers ─────────────────────────────────────────────────────

def _serialize_claim_summary(claim: Claim) -> dict:
    """Serialize claim for list view (no equipment)."""
    return {
        "id": str(claim.id),
        "status": claim.status.value,
        "site_address": claim.site_address,
        "site_contact": claim.site_contact,
        "claimed_amount": float(claim.claimed_amount),
        "assigned_to": {
            "id": str(claim.adjuster.id),
            "name": claim.adjuster.name,
        } if claim.adjuster else None,
        "policy": _serialize_policy_summary(claim.policy) if claim.policy else None,
        "created_at": claim.created_at.isoformat(),
        "updated_at": claim.updated_at.isoformat(),
    }


def _serialize_claim_detail(claim: Claim) -> dict:
    """Serialize claim for detail view (includes equipment)."""
    return {
        "id": str(claim.id),
        "status": claim.status.value,
        "site_address": claim.site_address,
        "site_contact": claim.site_contact,
        "claimed_amount": float(claim.claimed_amount),
        "assigned_to": {
            "id": str(claim.adjuster.id),
            "name": claim.adjuster.name,
        } if claim.adjuster else None,
        "policy": _serialize_policy_full(claim.policy) if claim.policy else None,
        "equipment": _serialize_equipment(claim.equipment) if claim.equipment else None,
        "created_at": claim.created_at.isoformat(),
        "updated_at": claim.updated_at.isoformat(),
    }


def _serialize_policy_summary(policy: Policy) -> dict:
    return {
        "holder_name": policy.holder_name,
        "equipment_type": policy.equipment_type,
        "insured_value": float(policy.insured_value),
    }


def _serialize_policy_full(policy: Policy) -> dict:
    return {
        "id": str(policy.id),
        "policy_number": policy.policy_number,
        "holder_name": policy.holder_name,
        "coverage_start": policy.coverage_start.isoformat(),
        "coverage_end": policy.coverage_end.isoformat(),
        "insured_value": float(policy.insured_value),
        "equipment_type": policy.equipment_type,
        "incident_type": policy.incident_type,
    }


def _serialize_equipment(equipment) -> dict:
    return {
        "id": str(equipment.id),
        "claim_id": str(equipment.claim_id),
        "equipment_id_qr": equipment.equipment_id_qr,
        "manufacturer": equipment.manufacturer,
        "model": equipment.model,
        "year": equipment.year,
        "cad_ref_url": equipment.cad_ref_url,
        "cad_match_status": equipment.cad_match_status.value,
        "created_at": equipment.created_at.isoformat(),
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    adjuster_id: UUID


class StatusRequest(BaseModel):
    status: str


# Valid status transitions per API contract
_ADJUSTER_TRANSITIONS = {
    ClaimStatus.assigned: ClaimStatus.on_site,
}

_HQ_TRANSITIONS = {
    ClaimStatus.completed: ClaimStatus.under_review,
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_claims(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    current_user: User = Depends(require_any),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List claims. Role-aware:
    - Adjuster: only their assigned claims
    - HQ: all claims
    """
    base_query = (
        select(Claim)
        .options(
            selectinload(Claim.adjuster),
            selectinload(Claim.policy),
        )
        .order_by(Claim.created_at.desc())
    )

    # Adjuster sees only their claims
    if current_user.role.value == "adjuster":
        base_query = base_query.where(Claim.assigned_to == current_user.id)

    # Optional status filter
    if status_filter:
        try:
            s = ClaimStatus(status_filter)
            base_query = base_query.where(Claim.status == s)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: '{status_filter}'",
            )

    # Total count (before pagination)
    count_query = select(func.count()).select_from(base_query.subquery())
    total = await db.scalar(count_query) or 0

    # Paginate
    paginated = base_query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(paginated)
    claims = result.scalars().all()

    return {
        "data": {
            "claims": [_serialize_claim_summary(c) for c in claims],
            "pagination": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": max(1, -(-total // per_page)),  # ceiling division
            },
        }
    }


@router.get("/{claim_id}")
async def get_claim(
    claim_id: UUID,
    current_user: User = Depends(require_any),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get full claim detail including policy and equipment.
    Adjuster can only access their own claims.
    """
    result = await db.execute(
        select(Claim)
        .options(
            selectinload(Claim.adjuster),
            selectinload(Claim.policy),
            selectinload(Claim.equipment),
        )
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()

    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    # Adjuster can only see their own claims
    if current_user.role.value == "adjuster" and claim.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {"data": _serialize_claim_detail(claim)}


@router.patch("/{claim_id}/assign")
async def assign_claim(
    claim_id: UUID,
    body: AssignRequest,
    current_user: User = Depends(require_hq),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Assign adjuster to an unassigned claim. Changes status to 'assigned'."""
    result = await db.execute(
        select(Claim).options(selectinload(Claim.adjuster)).where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.assigned_to is not None:
        raise HTTPException(
            status_code=409,
            detail="Claim already assigned. Use /reassign to change adjuster.",
        )

    # Verify adjuster exists
    adj_result = await db.execute(select(User).where(User.id == body.adjuster_id))
    adjuster = adj_result.scalar_one_or_none()
    if not adjuster:
        raise HTTPException(status_code=404, detail="Adjuster not found")

    claim.assigned_to = body.adjuster_id
    claim.status = ClaimStatus.assigned
    await db.commit()
    await db.refresh(claim)
    await db.refresh(claim, ["adjuster"])

    return {
        "data": {
            "id": str(claim.id),
            "status": claim.status.value,
            "assigned_to": {
                "id": str(adjuster.id),
                "name": adjuster.name,
            },
            "updated_at": claim.updated_at.isoformat(),
        }
    }


@router.patch("/{claim_id}/reassign")
async def reassign_claim(
    claim_id: UUID,
    body: AssignRequest,
    current_user: User = Depends(require_hq),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reassign claim to a different adjuster. Allowed on any non-terminal status."""
    terminal = {ClaimStatus.approved, ClaimStatus.rejected}

    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.status in terminal:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reassign a claim with status '{claim.status.value}'",
        )

    adj_result = await db.execute(select(User).where(User.id == body.adjuster_id))
    adjuster = adj_result.scalar_one_or_none()
    if not adjuster:
        raise HTTPException(status_code=404, detail="Adjuster not found")

    claim.assigned_to = body.adjuster_id
    await db.commit()
    await db.refresh(claim)

    return {
        "data": {
            "id": str(claim.id),
            "status": claim.status.value,
            "assigned_to": {
                "id": str(adjuster.id),
                "name": adjuster.name,
            },
            "updated_at": claim.updated_at.isoformat(),
        }
    }


@router.patch("/{claim_id}/status")
async def update_status(
    claim_id: UUID,
    body: StatusRequest,
    current_user: User = Depends(require_any),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Update claim status. Only valid transitions are allowed per role.
    Adjuster: assigned → on_site
    HQ: completed → under_review
    """
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    try:
        new_status = ClaimStatus(body.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: '{body.status}'")

    role = current_user.role.value
    current = claim.status
    allowed = False

    if role == "adjuster" and _ADJUSTER_TRANSITIONS.get(current) == new_status:
        # Adjuster can only update their own claim
        if claim.assigned_to != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        allowed = True
    elif role == "hq" and _HQ_TRANSITIONS.get(current) == new_status:
        allowed = True

    if not allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition: {current.value} → {new_status.value}",
        )

    claim.status = new_status
    await db.commit()
    await db.refresh(claim)

    return {
        "data": {
            "id": str(claim.id),
            "status": claim.status.value,
            "updated_at": claim.updated_at.isoformat(),
        }
    }
