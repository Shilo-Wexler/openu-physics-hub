"""Health probes for Kubernetes: live = process answers, ready = can serve requests."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core import db, settings

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live():
    # Process is up and answering. Never touches the DB.
    return {"status": "ok"}


@router.get("/ready")
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