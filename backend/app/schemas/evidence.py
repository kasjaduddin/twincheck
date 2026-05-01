from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class EvidenceItem(BaseModel):
    id: UUID
    claim_id: UUID
    type: str
    storage_url: str
    gps_lat: float
    gps_lng: float
    captured_at: datetime
    created_at: datetime


class EvidenceUploadResponse(BaseModel):
    data: EvidenceItem


class EvidenceListItem(BaseModel):
    id: UUID
    type: str
    storage_url: str
    captured_at: datetime


class EvidenceListPayload(BaseModel):
    evidence: list[EvidenceListItem]


class EvidenceListResponse(BaseModel):
    data: EvidenceListPayload