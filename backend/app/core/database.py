"""
Async database session factory.

Uses SQLAlchemy 2.x async engine with asyncpg driver.
Connection pooling is handled by Supabase's pgBouncer (transaction mode) —
pool_pre_ping is disabled because pgBouncer handles connection health.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Direct connection to Supabase PostgreSQL.
# pool_pre_ping=True ensures stale connections are detected and recycled.
# If migrating to pgBouncer (Transaction mode, port 6543) later:
#   - set pool_pre_ping=False
#   - add connect_args: {"statement_cache_size": 0, "prepared_statement_cache_size": 0}
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an async database session.

    Usage:
        @router.get("/example")
        async def example(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
