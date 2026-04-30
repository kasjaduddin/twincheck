"""
TWIN CHECK — FastAPI application entry point.

Registers all routers, middleware, and startup/shutdown handlers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth

app = FastAPI(
    title="TWIN CHECK API",
    version="1.0.0",
    description="Industrial insurance claims — AI × XR backend",
    # Disable docs in production
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# Routers
# ============================================================

app.include_router(auth.router, prefix="/v1")

# Remaining routers registered here as they are implemented:
# app.include_router(claims.router, prefix="/v1")
# app.include_router(equipment.router, prefix="/v1")
# app.include_router(coverage.router, prefix="/v1")
# app.include_router(reports.router, prefix="/v1")
# app.include_router(evidence.router, prefix="/v1")
# app.include_router(damage_findings.router, prefix="/v1")
# app.include_router(gs_jobs.router, prefix="/v1")
# app.include_router(users.router, prefix="/v1")


# ============================================================
# Health check
# ============================================================

@app.get("/health")
async def health_check() -> dict:
    """Railway health check endpoint."""
    return {"status": "ok", "service": "twincheck-api"}
