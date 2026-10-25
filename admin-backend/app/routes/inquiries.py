"""Inquiries. Two routers in one file, like announcements:

- router: the public site's anonymous form, POST /api/inquiries. No sign-in, and no identity is stored.
- admin_router: the console, /api/admin/inquiries. Every admin level may use it.

Anti-flood on the public route is layered: the Ingress limits requests per IP (429, before this code
runs), Turnstile stops scripts, and the honeypot field catches simple bots.
Only GET and POST are used (as in announcements), so a change is a POST to /{id}.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.db import pool
from app.routes.deps import Admin, Conn, http_errors, require_admin
from app.schemas.inquiries import InquiryStatus, InquiryType, InquiryUpdate, NewInquiry
from app.services import inquiries, turnstile

log = logging.getLogger("uvicorn.error")

# What a caught bot gets back. The site ignores the id, and a bot only sees a normal 201.
HONEYPOT_ID = 0

router = APIRouter(prefix="/api", tags=["public"])
admin_router = APIRouter(prefix="/api/admin/inquiries", tags=["admin"], dependencies=[Depends(require_admin)])

# What each error of the services means for the client. None: the error's own message is the detail.
_ERRORS = {
    turnstile.Unavailable: (status.HTTP_503_SERVICE_UNAVAILABLE, None),
    turnstile.Rejected: (status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid turnstile_token"),
    inquiries.UnknownCourse: (status.HTTP_422_UNPROCESSABLE_ENTITY, "unknown course"),
    inquiries.InvalidValue: (status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid field value"),
    inquiries.NotFound: (status.HTTP_404_NOT_FOUND, "inquiry not found"),
}


# ---------- Public site ----------

@router.post("/inquiries", status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: NewInquiry):
    if payload.website:
        # Same status as a real inquiry, so the bot cannot tell it was caught. Nothing is saved.
        log.info("inquiry dropped by honeypot")
        return {"id": HONEYPOT_ID}

    if not payload.turnstile_token:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "missing turnstile_token")
    with http_errors(_ERRORS):
        turnstile.verify(payload.turnstile_token)

    # The connection is taken only after Turnstile: the check can wait on Cloudflare for seconds,
    # and a flood must not hold every pool connection while it waits.
    with pool.connection() as conn, http_errors(_ERRORS):
        inquiry_id = inquiries.create(conn, payload.course_id, payload.type, payload.content)
    return {"id": inquiry_id}


# ---------- Console ----------

@admin_router.get("")
def list_inquiries(
    conn: Conn,
    # "status" and "type" in the URL; other names in Python so they don't hide fastapi.status or type().
    status_filter: Annotated[InquiryStatus | None, Query(alias="status")] = None,
    type_filter: Annotated[InquiryType | None, Query(alias="type")] = None,
    course: Annotated[int | None, Query(ge=0)] = None,
    before: Annotated[int | None, Query(ge=1)] = None,
):
    """Newest first, a page at a time. Next page: before=next_before; null on the last page."""
    return inquiries.list_page(conn, status_filter, type_filter, course, before)


# Declared before /{inquiry_id}, so "counts" is not taken for an id.
@admin_router.get("/counts")
def count_inquiries(conn: Conn):
    """How many inquiries are in each status, for the console's tabs."""
    return inquiries.counts(conn)


@admin_router.get("/{inquiry_id}")
def get_inquiry(inquiry_id: int, conn: Conn):
    with http_errors(_ERRORS):
        return inquiries.get(conn, inquiry_id)


@admin_router.post("/{inquiry_id}")
def update_inquiry(inquiry_id: int, payload: InquiryUpdate, user: Admin, conn: Conn):
    """Changes the status and/or the internal note; a field left out stays as it is.
    Returns the inquiry as it is now."""
    sent = payload.model_fields_set
    if not sent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "nothing to update")
    if "status" in sent and payload.status is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid status")
    with http_errors(_ERRORS):
        return inquiries.update(conn, inquiry_id, user.email, payload.model_dump(include=sent))
    