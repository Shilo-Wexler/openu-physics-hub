"""Postgres connection pool shared by all requests."""

import asyncpg
from app.core import settings

pool: asyncpg.Pool | None = None


async def open_pool() -> None:
    global pool
    # min_size=0: the server starts even if the DB is down; readiness reports it instead.
    pool = await asyncpg.create_pool(
        settings.DATABASE_URL, min_size=0, max_size=settings.DB_POOL_MAX
    )


async def close_pool() -> None:
    if pool is not None:
        await pool.close()
