from uuid import UUID
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Evidence


class EvidenceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        claim_id: UUID,
        evidence_type: str,
        storage_url: str,
        gps_lat: float,
        gps_lng: float,
        gps_accuracy: Optional[float],
        captured_at: datetime,
        device_id: str,
        consent_flag: bool,
    ) -> Evidence:
        evidence = Evidence(
            claim_id=claim_id,
            type=evidence_type,
            storage_url=storage_url,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
            gps_accuracy=gps_accuracy,
            captured_at=captured_at,
            device_id=device_id,
            consent_flag=consent_flag,
        )
        self.db.add(evidence)
        await self.db.commit()
        await self.db.refresh(evidence)
        return evidence

    async def list_by_claim(
        self,
        claim_id: UUID,
        type_filter: Optional[str] = None,
    ) -> list[Evidence]:
        query = (
            select(Evidence)
            .where(Evidence.claim_id == claim_id)
            .order_by(Evidence.captured_at.asc())
        )
        if type_filter:
            query = query.where(Evidence.type == type_filter)
        result = await self.db.execute(query)
        return list(result.scalars().all())