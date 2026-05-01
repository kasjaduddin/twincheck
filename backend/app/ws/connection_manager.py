"""WebSocket connection manager — tracks active connections per claim."""

import json
import logging
from uuid import UUID
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, claim_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[str(claim_id)].add(websocket)

    def disconnect(self, claim_id: UUID, websocket: WebSocket) -> None:
        key = str(claim_id)
        self._connections[key].discard(websocket)
        if not self._connections[key]:
            del self._connections[key]

    async def broadcast(self, claim_id: UUID, message: dict) -> None:
        key = str(claim_id)
        stale = []
        for ws in list(self._connections.get(key, [])):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(claim_id, ws)


manager = ConnectionManager()