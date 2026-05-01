"""
Evidence router.
POST /claims/:id/evidence  [adjuster] — upload file
GET  /claims/:id/evidence  [both]     — list evidence

Evidence is immutable after creation — no update/delete endpoints.
GPS and timestamp come from device, not server (FR-MR-05.25).
"""

from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth import require_adjuster, require_any
from app.core.database import get_db
from app.models import Claim, Evidence, User
from app.repositories.evidence_repository import EvidenceRepository
from app.services.storage_service import upload_evidence
from app.schemas.evidence import (
    EvidenceUploadResponse,
    EvidenceItem,
    EvidenceListResponse,
    EvidenceListPayload,
    EvidenceListItem,
)

router = APIRouter(tags=["evidence"])

VALID_TYPES = {"audio", "video", "point_cloud", "splat"}
MAX_BYTES = 200 * 1024 * 1024  # 200 MB


@router.post("/claims/{claim_id}/evidence", status_code=201)
async def upload_evidence_file(
    claim_id: UUID,
    file: UploadFile = File(...),
    type: str = Form(...),
    gps_lat: float = Form(...),
    gps_lng: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    captured_at: datetime = Form(...),
    device_id: str = Form(...),
    consent_flag: bool = Form(...),
    current_user: User = Depends(require_adjuster),
    db: AsyncSession = Depends(get_db),
) -> EvidenceUploadResponse:
    """
    Upload one evidence file. GPS and timestamp must be device-captured.
    consent_flag must be true for audio type.
    """
    if type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type: '{type}'. Valid: audio, video, point_cloud",
        )
    if type == "audio" and not consent_flag:
        raise HTTPException(
            status_code=400,
            detail="consent_flag must be true for audio recordings",
        )

    # Adjuster must own this claim
    claim_result = await db.execute(
        select(Claim).where(
            Claim.id == claim_id,
            Claim.assigned_to == current_user.id,
        )
    )
    if not claim_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 200 MB)")

    evidence_id = uuid4()
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or f"evidence_{evidence_id}"

    try:
        storage_url = await upload_evidence(
            claim_id=claim_id,
            evidence_id=evidence_id,
            file_bytes=file_bytes,
            content_type=content_type,
            filename=filename,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    repo = EvidenceRepository(db)
    evidence = await repo.create(
        claim_id=claim_id,
        evidence_type=type,
        storage_url=storage_url,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        gps_accuracy=gps_accuracy,
        captured_at=captured_at,
        device_id=device_id,
        consent_flag=consent_flag,
    )

    return EvidenceUploadResponse(
        data=EvidenceItem(
            id=evidence.id,
            claim_id=evidence.claim_id,
            type=str(evidence.type.value),
            storage_url=evidence.storage_url,
            gps_lat=float(evidence.gps_lat),
            gps_lng=float(evidence.gps_lng),
            captured_at=evidence.captured_at,
            created_at=evidence.created_at,
        )
    )


@router.get("/claims/{claim_id}/evidence")
async def list_evidence(
    claim_id: UUID,
    type: Optional[str] = Query(None),
    current_user: User = Depends(require_any),
    db: AsyncSession = Depends(get_db),
) -> EvidenceListResponse:
    """List all evidence for a claim. Adjuster can only see their own claims."""
    if type and type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type filter: '{type}'")

    if current_user.role.value == "adjuster":
        claim_result = await db.execute(
            select(Claim).where(
                Claim.id == claim_id,
                Claim.assigned_to == current_user.id,
            )
        )
        if not claim_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Access denied")

    repo = EvidenceRepository(db)
    items = await repo.list_by_claim(claim_id, type_filter=type)

    return EvidenceListResponse(
        data=EvidenceListPayload(
            evidence=[
                EvidenceListItem(
                    id=item.id,
                    type=str(item.type.value),
                    storage_url=item.storage_url,
                    captured_at=item.captured_at,
                )
                for item in items
            ]
        )
    )