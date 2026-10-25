"""Inquiries. Two routers in one file, like announcements:

- router: the public site's anonymous form, POST /api/inquiries. No sign-in, and no identity is stored.
- admin_router: the console, /api/admin/inquiries. Every admin level may use it.

Anti-flood on the public route is layered: the Ingress limits requests per IP (429, before this code
runs), Turnstile stops scripts, and the honeypot field catches simple bots.
Only GET and POST are used (as in announcements), so a change is a POST to /{id}.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from app.core.db import get_conn, pool
from app.routes.deps import GoogleUser, require_admin
from app.schemas.inquiries import InquiryStatus, InquiryType, InquiryUpdate, NewInquiry
from app.services import inquiries, turnstile

log = logging.getLogger("uvicorn.error")

# What a caught bot gets back. The site ignores the id, and a bot only sees a normal 201.
HONEYPOT_ID = 0

router = APIRouter(prefix="/api", tags=["public"])
admin_router = APIRouter(prefix="/api/admin/inquiries", tags=["admin"], dependencies=[Depends(require_admin)])


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "inquiry not found")


# ---------- Public site ----------

@router.post("/inquiries", status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: NewInquiry):
    if payload.website:
        # Same status as a real inquiry, so the bot cannot tell it was caught. Nothing is saved.
        log.info("inquiry dropped by honeypot")
        return {"id": HONEYPOT_ID}

    if not payload.turnstile_token:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "missing turnstile_token")
    try:
        turnstile.verify(payload.turnstile_token)
    except turnstile.Unavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None
    except turnstile.Rejected:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid turnstile_token") from None

    # The connection is taken only after Turnstile: the check can wait on Cloudflare for seconds,
    # and a flood must not hold every pool connection while it waits.
    with pool.connection() as conn:
        try:
            inquiry_id = inquiries.create(conn, payload.course_id, payload.type, payload.content)
        except inquiries.UnknownCourse:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "unknown course") from None
        except inquiries.InvalidValue:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid field value") from None

    return {"id": inquiry_id}


# ---------- Console ----------

@admin_router.get("")
def list_inquiries(
    # "status" and "type" in the URL; other names in Python so they don't hide fastapi.status or type().
    status_filter: InquiryStatus | None = Query(None, alias="status"),
    type_filter: InquiryType | None = Query(None, alias="type"),
    course: int | None = Query(None, ge=0),
    before: int | None = Query(None, ge=1),
    conn: Connection = Depends(get_conn),
):
    """Newest first, a page at a time. Next page: before=next_before; null on the last page."""
    return inquiries.list_page(conn, status_filter, type_filter, course, before)


# Declared before /{inquiry_id}, so "counts" is not taken for an id.
@admin_router.get("/counts")
def count_inquiries(conn: Connection = Depends(get_conn)):
    """How many inquiries are in each status, for the console's tabs."""
    return inquiries.counts(conn)


@admin_router.get("/{inquiry_id}")
def get_inquiry(inquiry_id: int, conn: Connection = Depends(get_conn)):
    try:
        return inquiries.get(conn, inquiry_id)
    except inquiries.NotFound:
        raise _not_found() from None


@admin_router.post("/{inquiry_id}")
def update_inquiry(
    inquiry_id: int,
    payload: InquiryUpdate,
    user: GoogleUser = Depends(require_admin),
    conn: Connection = Depends(get_conn),
):
    """Changes the status and/or the internal note; a field left out stays as it is.
    Returns the inquiry as it is now."""
    sent = payload.model_fields_set
    if not sent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "nothing to update")
    if "status" in sent and payload.status is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid status")
    try:
        return inquiries.update(conn, inquiry_id, user.email, payload.model_dump(include=sent))
    except inquiries.NotFound:
        raise _not_found() from None