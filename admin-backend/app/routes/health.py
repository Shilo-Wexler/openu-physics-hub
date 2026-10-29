"""Health probes for Kubernetes: live = process answers, ready = can serve requests."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.db import pool

router = APIRouter(prefix="/health", tags=["health"])

# Seconds a readiness check may wait for a DB connection, and for its query, before reporting not ready.
READY_TIMEOUT = 2


@router.get("/live")
def live():
    # Process is up and answering. Never touches the DB.
    return {"status": "ok"}


@router.get("/ready")
def ready():
    # DB answers and at least one course is loaded, the same check as the chat backend.
    # exists() stops at the first row, so it stays cheap as the table grows.
    try:
        with pool.connection(timeout=READY_TIMEOUT) as conn:
            conn.execute(f"set local statement_timeout = {READY_TIMEOUT * 1000}")
            row = conn.execute("select exists (select 1 from courses) as has_courses").fetchone()
    except Exception as exc:  # noqa: BLE001 - any failure means not ready
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": type(exc).__name__}
        )
    if not row["has_courses"]:
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": "no courses loaded"}
        )
    return {"status": "ok"}