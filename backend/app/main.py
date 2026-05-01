"""
TWIN CHECK — FastAPI application entry point.

Registers all routers, middleware, and startup/shutdown handlers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, claims, users, reports, evidence

from uuid import UUID
from fastapi import WebSocket
from app.ws.report_live import report_live_endpoint

app = FastAPI(
    title="TWIN CHECK API",
    version="1.0.0",
    description="Industrial insurance claims — AI × XR backend",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router,    prefix="/v1")
app.include_router(claims.router,  prefix="/v1")
app.include_router(reports.router, prefix="/v1")
app.include_router(users.router,   prefix="/v1")
app.include_router(evidence.router, prefix="/v1")

# Remaining routers added as phases are implemented:
# app.include_router(equipment.router,       prefix="/v1")  # Phase 2 UC-03
# app.include_router(coverage.router,        prefix="/v1")  # Phase 2 UC-04
# app.include_router(evidence.router,        prefix="/v1")  # Phase 2 UC-02, UC-04
# app.include_router(damage_findings.router, prefix="/v1")  # Phase 2 UC-04
# app.include_router(gs_jobs.router,         prefix="/v1")  # Phase 6

# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/v1/claims/{claim_id}/report/live")
async def report_live(websocket: WebSocket, claim_id: UUID):
    """
    Live report update stream for UC-04 damage detection.
    Auth: JWT passed as ?token= query param (WS cannot use Authorization header).
    """
    await report_live_endpoint(websocket, claim_id)

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check() -> dict:
    """Railway health check endpoint."""
    return {"status": "ok", "service": "twincheck-api"}