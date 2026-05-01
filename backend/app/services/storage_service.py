"""
Upload evidence files to Supabase Storage via REST API.
Uses httpx directly — no supabase Python SDK needed until Phase 5.

Bucket "evidence" must exist in Supabase dashboard before calling this.
"""

from uuid import UUID
import httpx
from app.core.config import settings

EVIDENCE_BUCKET = "evidence"


async def upload_evidence(
    claim_id: UUID,
    evidence_id: UUID,
    file_bytes: bytes,
    content_type: str,
    filename: str,
) -> str:
    """
    Upload file to Supabase Storage. Returns public URL.
    Path: evidence/{claim_id}/{evidence_id}/{filename}

    Raises RuntimeError if storage is not configured.
    Raises httpx.HTTPStatusError if upload fails.
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "Storage not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY in .env"
        )

    path = f"{claim_id}/{evidence_id}/{filename}"
    url = f"{settings.supabase_url}/storage/v1/object/{EVIDENCE_BUCKET}/{path}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            url,
            content=file_bytes,
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )
        response.raise_for_status()

    return (
        f"{settings.supabase_url}/storage/v1/object/public"
        f"/{EVIDENCE_BUCKET}/{path}"
    )