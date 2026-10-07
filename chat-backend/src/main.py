"""Chat backend entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

import db
import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open_pool()
    yield
    await db.close_pool()


app = FastAPI(title="Chat backend", lifespan=lifespan)


@app.get("/health/live")
async def live():
    # Process is up and answering. Never touches the DB.
    return {"status": "ok"}


@app.get("/health/ready")
async def ready():
    # DB answers and at least one course is loaded. No fixed course count:
    # exists() stops at the first row, so it stays cheap as the table grows.
    try:
        async with db.pool.acquire(timeout=settings.READY_TIMEOUT) as conn:
            has_courses = await conn.fetchval(
                "select exists (select 1 from courses)", timeout=settings.READY_TIMEOUT
            )
    except Exception as exc:
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": type(exc).__name__}
        )
    if not has_courses:
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": "no courses loaded"}
        )
    return {"status": "ok"}
