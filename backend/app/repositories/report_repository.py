from uuid import UUID
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models import Report


class ReportRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_claim_id(self, claim_id: UUID) -> Report | None:
        result = await self.db.execute(
            select(Report).where(Report.claim_id == claim_id)
        )
        return result.scalar_one_or_none()

    async def ensure_exists(self, claim_id: UUID) -> Report:
        """Get report row, or create empty one if not yet created."""
        report = await self.get_by_claim_id(claim_id)
        if report is None:
            report = Report(claim_id=claim_id)
            self.db.add(report)
            await self.db.flush()
            await self.db.refresh(report)
        return report

    async def update_section(
        self, claim_id: UUID, section: str, data: dict[str, Any]
    ) -> Report | None:
        """Overwrite one JSONB section column. section must be pre-validated."""
        column = f"section_{section}"
        stmt = (
            update(Report)
            .where(Report.claim_id == claim_id)
            .values(**{column: data})
            .returning(Report)
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.scalar_one_or_none()