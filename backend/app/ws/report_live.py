"""
WebSocket endpoint for live report updates (UC-04).
Auth via ?token= query param — WebSocket cannot use Authorization header.

Phase 2: connection management only.
Phase 3: STT will call broadcast_checklist_update() from here.
"""

import json
import logging
from uuid import UUID
from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError

from app.core.auth import decode_token
from app.ws.connection_manager import manager

logger = logging.getLogger(__name__)


async def report_live_endpoint(websocket: WebSocket, claim_id: UUID) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("No subject in token")
    except (JWTError, ValueError) as e:
        logger.warning("WS auth failed claim=%s: %s", claim_id, e)
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    await manager.connect(claim_id, websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("event") == "ping":
                    await websocket.send_text(json.dumps({"event": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(claim_id, websocket)


# ── Called by Phase 3 AI service to push updates ─────────────────────────────

async def broadcast_checklist_update(
    claim_id: UUID, checklist: dict[str, bool]
) -> None:
    """Push STT checklist auto-check state to MR App (Phase 3)."""
    await manager.broadcast(claim_id, {
        "event": "checklist_update",
        "checklist": checklist,
    })


async def broadcast_section_update(
    claim_id: UUID, section: str, status_text: str, data: dict
) -> None:
    """Push live report section data to MR App status bar (Phase 3-4)."""
    await manager.broadcast(claim_id, {
        "event": "section_updated",
        "section": section,
        "status_text": status_text,
        "data": data,
    })