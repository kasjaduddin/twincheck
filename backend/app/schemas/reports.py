from typing import Any
from datetime import datetime
from pydantic import BaseModel


class SectionUpdateRequest(BaseModel):
    data: dict[str, Any]


class SectionUpdatePayload(BaseModel):
    section: str
    updated_at: datetime


class SectionUpdateResponse(BaseModel):
    data: SectionUpdatePayload