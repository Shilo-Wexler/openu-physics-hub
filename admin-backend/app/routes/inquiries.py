"""Inquiries. Two routers in one file, like announcements:

- router: the public site's anonymous form, POST /api/inquiries. No sign-in, and no identity is stored.
- admin_router: the console, /api/admin/inquiries. Every admin level may use it.

Anti-flood on the public route is layered: the Ingress limits requests per IP (429, before this code
runs), Turnstile stops scripts, and the honeypot field catches simple bots.
Only GET and POST are used (as in announcements), so a change is a POST to /{id}.
"""

import logging
from typing import get_args

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection, errors

from app.services import turnstile
from app.routes.deps import GoogleUser, require_admin
from app.core.db import get_conn, pool
from app.schemas import InquiryStatus, InquiryType, InquiryUpdate, NewInquiry

log = logging.getLogger("uvicorn.error")

# What a caught bot gets back. The site ignores the id, and a bot only sees a normal 201.
HONEYPOT_ID = 0

# Inquiries per page in the console. Paged by id (newest first), which reads straight from the
# (status, id desc) index, so every page is as fast as the first one.
CONSOLE_PAGE_SIZE = 50

STATUSES: tuple[str, ...] = get_args(InquiryStatus)

# The course name comes with every inquiry, so the console needs no separate course list.
ADMIN_COLUMNS = """
  i.id, i.course_number, c.name as course_name, i.type, i.content, i.status,
  i.handled_by, i.internal_note, i.created_at, i.updated_at
"""
ADMIN_FROM = "from inquiries i join courses c on c.course_number = i.course_number"

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
    """Newest first, CONSOLE_PAGE_SIZE at a time, optionally of one status, type or course.
    Next page: before=next_before. next_before is null on the last page."""
    conditions: list[str] = []
    params: dict = {"limit": CONSOLE_PAGE_SIZE + 1}
    if status_filter is not None:
        conditions.append("i.status = %(status)s")
        params["status"] = status_filter
    if type_filter is not None:
        conditions.append("i.type = %(type)s")
        params["type"] = type_filter
    if course is not None:
        conditions.append("i.course_number = %(course)s")
        params["course"] = course
    if before is not None:
        conditions.append("i.id < %(before)s")
        params["before"] = before
    where = f"where {' and '.join(conditions)}" if conditions else ""

    # One extra row tells whether another page exists, without a separate count query.
    rows = conn.execute(
        f"select {ADMIN_COLUMNS} {ADMIN_FROM} {where} order by i.id desc limit %(limit)s", params
    ).fetchall()
    has_more = len(rows) > CONSOLE_PAGE_SIZE
    rows = rows[:CONSOLE_PAGE_SIZE]
    return {"items": rows, "next_before": rows[-1]["id"] if has_more else None}


# Declared before /{inquiry_id}, so "counts" is not taken for an id.
@admin_router.get("/counts")
def count_inquiries(conn: Connection = Depends(get_conn)):
    """How many inquiries are in each status, for the console's tabs. Every status is listed, 0 included."""
    rows = conn.execute("select status, count(*) as n from inquiries group by status").fetchall()
    counts = dict.fromkeys(STATUSES, 0)
    for row in rows:
        counts[row["status"]] = row["n"]
    return counts


def _get(conn: Connection, inquiry_id: int) -> dict:
    row = conn.execute(f"select {ADMIN_COLUMNS} {ADMIN_FROM} where i.id = %s", (inquiry_id,)).fetchone()
    if row is None:
        raise _not_found()
    return row


@admin_router.get("/{inquiry_id}")
def get_inquiry(inquiry_id: int, conn: Connection = Depends(get_conn)):
    return _get(conn, inquiry_id)


@admin_router.post("/{inquiry_id}")
def update_inquiry(
    inquiry_id: int,
    payload: InquiryUpdate,
    user: GoogleUser = Depends(require_admin),
    conn: Connection = Depends(get_conn),
):
    """Changes the status and/or the internal note; a field left out stays as it is.
    handled_by is who took the inquiry on or closed it: set when the status changes to in_progress or
    closed, and cleared when it goes back to new (back in the queue, nobody's). Returns the inquiry as it is now."""
    sent = payload.model_fields_set
    if not sent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "nothing to update")
    if "status" in sent and payload.status is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid status")

    changes = ["updated_at = now()"]
    params: dict = {"id": inquiry_id}
    if "status" in sent:
        if payload.status == "new":
            changes.append("handled_by = null")
        else:
            # Moves only when the status really changes, so saving the same status keeps the handler.
            # On the right of "=", status is still the old value.
            changes.append(
                "handled_by = case when status is distinct from %(status)s then %(by)s else handled_by end"
            )
            params["by"] = user.email
        changes.append("status = %(status)s")
        params["status"] = payload.status
    if "internal_note" in sent:
        changes.append("internal_note = %(note)s")
        params["note"] = payload.internal_note or None  # "" clears the note too

    row = conn.execute(
        f"update inquiries set {', '.join(changes)} where id = %(id)s returning id", params
    ).fetchone()
    if row is None:
        raise _not_found()
    return _get(conn, inquiry_id)
