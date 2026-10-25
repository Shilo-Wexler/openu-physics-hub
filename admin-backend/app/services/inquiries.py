"""Inquiries: the anonymous ones the public form sends, and how the console handles them.

No identity is ever stored with an inquiry. handled_by is the admin who took it on or closed it.
"""

from typing import get_args

from psycopg import Connection, errors

from app.schemas.inquiries import InquiryStatus

# Inquiries per page in the console. Paged by id (newest first), which reads straight from the
# (status, id desc) index, so every page is as fast as the first one.
PAGE_SIZE = 50

STATUSES: tuple[str, ...] = get_args(InquiryStatus)

# The course name comes with every inquiry, so the console needs no separate course list.
COLUMNS = """
  i.id, i.course_number, c.name as course_name, i.type, i.content, i.status,
  i.handled_by, i.internal_note, i.created_at, i.updated_at
"""
FROM = "from inquiries i join courses c on c.course_number = i.course_number"


class NotFound(Exception):
    pass


class UnknownCourse(Exception):
    pass


class InvalidValue(Exception):
    """A DB check rejected one of the values."""


def create(conn: Connection, course_number: int, inquiry_type: str, content: str) -> int:
    """Saves a new inquiry and returns its id."""
    try:
        row = conn.execute(
            """
            insert into inquiries (course_number, type, content)
            values (%(course)s, %(type)s, %(content)s)
            returning id
            """,
            {"course": course_number, "type": inquiry_type, "content": content},
        ).fetchone()
    except errors.ForeignKeyViolation:
        raise UnknownCourse() from None
    except errors.CheckViolation:
        raise InvalidValue() from None
    return row["id"]


def list_page(
    conn: Connection,
    status: str | None = None,
    inquiry_type: str | None = None,
    course: int | None = None,
    before: int | None = None,
) -> dict:
    """Newest first, PAGE_SIZE at a time, optionally of one status, type or course.
    Next page: before=next_before. next_before is None on the last page."""
    conditions: list[str] = []
    params: dict = {"limit": PAGE_SIZE + 1}
    if status is not None:
        conditions.append("i.status = %(status)s")
        params["status"] = status
    if inquiry_type is not None:
        conditions.append("i.type = %(type)s")
        params["type"] = inquiry_type
    if course is not None:
        conditions.append("i.course_number = %(course)s")
        params["course"] = course
    if before is not None:
        conditions.append("i.id < %(before)s")
        params["before"] = before
    where = f"where {' and '.join(conditions)}" if conditions else ""

    # One extra row tells whether another page exists, without a separate count query.
    rows = conn.execute(
        f"select {COLUMNS} {FROM} {where} order by i.id desc limit %(limit)s", params
    ).fetchall()
    has_more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    return {"items": rows, "next_before": rows[-1]["id"] if has_more else None}


def counts(conn: Connection) -> dict[str, int]:
    """How many inquiries are in each status. Every status is listed, 0 included."""
    rows = conn.execute("select status, count(*) as n from inquiries group by status").fetchall()
    result = dict.fromkeys(STATUSES, 0)
    for row in rows:
        result[row["status"]] = row["n"]
    return result


def get(conn: Connection, inquiry_id: int) -> dict:
    row = conn.execute(f"select {COLUMNS} {FROM} where i.id = %s", (inquiry_id,)).fetchone()
    if row is None:
        raise NotFound()
    return row


def update(conn: Connection, inquiry_id: int, actor_email: str, fields: dict) -> dict:
    """Changes the status and/or the internal note: only the keys in fields ("status", "internal_note").
    handled_by is who took the inquiry on or closed it: set when the status changes to in_progress or
    closed, and cleared when it goes back to new (back in the queue, nobody's). Returns the inquiry as it is now."""
    changes = ["updated_at = now()"]
    params: dict = {"id": inquiry_id}
    if "status" in fields:
        if fields["status"] == "new":
            changes.append("handled_by = null")
        else:
            # Moves only when the status really changes, so saving the same status keeps the handler.
            # On the right of "=", status is still the old value.
            changes.append(
                "handled_by = case when status is distinct from %(status)s then %(by)s else handled_by end"
            )
            params["by"] = actor_email
        changes.append("status = %(status)s")
        params["status"] = fields["status"]
    if "internal_note" in fields:
        changes.append("internal_note = %(note)s")
        params["note"] = fields["internal_note"] or None  # "" clears the note too

    row = conn.execute(
        f"update inquiries set {', '.join(changes)} where id = %(id)s returning id", params
    ).fetchone()
    if row is None:
        raise NotFound()
    return get(conn, inquiry_id)