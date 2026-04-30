"""
Reports and damage findings router — Phase 1 (read-only).

Implements:
    GET /claims/:id/report              [both] — current report state
    GET /claims/:id/damage-findings     [both] — all damage findings for a claim
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_any
from app.core.database import get_db
from app.models import Claim, DamageFinding, Report, User
from app.models.user import ClaimStatus

router = APIRouter(tags=["reports"])


# ── /claims/:id/report ────────────────────────────────────────────────────────

@router.get("/claims/{claim_id}/report")
async def get_report(
    claim_id: UUID,
    current_user: User = Depends(require_any),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return current report state for a claim.
    Sections that are not yet filled return null.
    Adjuster can only access their own claims.
    """
    # Verify claim access
    claim_result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = claim_result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role.value == "adjuster" and claim.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(select(Report).where(Report.claim_id == claim_id))
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found for this claim")

    return {
        "data": {
            "id": str(report.id),
            "claim_id": str(report.claim_id),
            "section_a": report.section_a,
            "section_b": report.section_b,
            "section_c": report.section_c,
            "section_d": report.section_d,
            "section_e": report.section_e,
            "section_f": report.section_f,
            "section_g": report.section_g,
            "submitted_at": report.submitted_at.isoformat() if report.submitted_at else None,
            "updated_at": report.updated_at.isoformat(),
        }
    }


# ── /claims/:id/damage-findings ───────────────────────────────────────────────

@router.get("/claims/{claim_id}/damage-findings")
async def get_damage_findings(
    claim_id: UUID,
    severity: str | None = Query(None),
    current_user: User = Depends(require_any),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return all damage findings for a claim.
    Optional severity filter: red | amber | green.
    """
    claim_result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = claim_result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role.value == "adjuster" and claim.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    query = select(DamageFinding).where(DamageFinding.claim_id == claim_id)

    if severity:
        from app.models.user import DamageSeverity
        try:
            sev = DamageSeverity(severity)
            query = query.where(DamageFinding.severity == sev)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid severity: '{severity}'")

    result = await db.execute(query)
    findings = result.scalars().all()

    return {
        "data": {
            "findings": [
                {
                    "id": str(f.id),
                    "component_id": f.component_id,
                    "component_type": f.component_type,
                    "deviation_type": f.deviation_type,
                    "measurement": float(f.measurement) if f.measurement else None,
                    "severity": f.severity.value,
                    "spatial_position": f.spatial_position,
                    "covered": f.covered,
                    "policy_clause": f.policy_clause,
                }
                for f in findings
            ]
        }
    }
