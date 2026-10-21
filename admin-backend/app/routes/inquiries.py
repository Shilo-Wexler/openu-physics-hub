"""Public: the anonymous inquiry form, POST /api/inquiries. No sign-in, and no identity is stored.

Anti-flood is layered: the Ingress limits requests per IP (429, before this code runs),
Turnstile stops scripts, and the honeypot field catches simple bots.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from psycopg import errors

from .. import turnstile
from ..db import pool
from ..schemas import NewInquiry

router = APIRouter(prefix="/api", tags=["public"])

log = logging.getLogger("uvicorn.error")

# What a caught bot gets back. The site ignores the id, and a bot only sees a normal 201.
HONEYPOT_ID = 0


@router.post("/inquiries", status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: NewInquiry):
    if payload.website:
        # Same status as a real inquiry, so the bot cannot tell it was caught. Nothing is saved.
        log.info("inquiry dropped by honeypot")
        return {"id": HONEYPOT_ID}

    if not payload.turnstile_token:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "missing turnstile_token")
    turnstile.verify(payload.turnstile_token)

    # The connection is taken only after Turnstile: the check can wait on Cloudflare for seconds,
    # and a flood must not hold every pool connection while it waits.
    with pool.connection() as conn:
        try:
            row = conn.execute(
                """
                insert into inquiries (course_number, type, content)
                values (%(course)s, %(type)s, %(content)s)
                returning id
                """,
                {"course": payload.course_id, "type": payload.type, "content": payload.content},
            ).fetchone()
        except errors.ForeignKeyViolation:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "unknown course")
        except errors.CheckViolation:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid field value")

    return {"id": row["id"]}