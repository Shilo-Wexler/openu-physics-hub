"""The console's stats screen: one GET with everything the screen shows, for one period.

Inquiry numbers come from this DB. The most active chat courses come from the chat backend's
/internal API (chat_client); when the chat backend fails, only that part is null and the rest
of the screen still works. Every admin level may use it.
"""

from datetime import timedelta
from typing import Literal, get_args

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from app.services import chat_client
from app.routes.deps import require_admin
from app.core.db import get_conn
from app.schemas import InquiryType

# The periods the console offers, in days. "all" has no start, so nothing to compare it with.
Period = Literal["7", "30", "all"]
PERIOD_DAYS: dict[str, int | None] = {"7": 7, "30": 30, "all": None}

# How many courses each top list shows.
TOP_COURSES = 5

TYPES: tuple[str, ...] = get_args(InquiryType)

router = APIRouter(prefix="/api/admin/stats", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("")
def get_stats(period: Period, conn: Connection = Depends(get_conn)):
    days = PERIOD_DAYS[period]
    span = timedelta(days=days) if days is not None else None
    return {
        "period": period,
        "inquiries": _inquiries(conn, span),
        "chat_courses": _chat_courses(days),
    }


def _inquiries(conn: Connection, span: timedelta | None) -> dict:
    """Inquiries received in the period (any status): how many, how many in the period just
    before it (null for "all"), how many of each type, and the courses with the most."""
    # No period, no condition: "all" counts the whole table instead of comparing every row to a date.
    where = "where created_at >= now() - %(span)s" if span is not None else ""
    params = {"span": span, "top": TOP_COURSES}

    rows = conn.execute(
        f"select type, count(*) as n from inquiries {where} group by type", params
    ).fetchall()
    by_type = dict.fromkeys(TYPES, 0)
    for row in rows:
        by_type[row["type"]] = row["n"]

    previous = None
    if span is not None:
        previous = conn.execute(
            """
            select count(*) as n from inquiries
             where created_at >= now() - 2 * %(span)s and created_at < now() - %(span)s
            """,
            params,
        ).fetchone()["n"]

    # Count first, then join: course names are read for the top rows only.
    top_courses = conn.execute(
        f"""
        select t.course_number, c.name as course_name, t.inquiry_count
          from (select course_number, count(*) as inquiry_count
                  from inquiries {where}
                 group by course_number
                 order by inquiry_count desc, course_number
                 limit %(top)s) t
          join courses c on c.course_number = t.course_number
         order by t.inquiry_count desc, t.course_number
        """,
        params,
    ).fetchall()

    return {
        # Every inquiry has exactly one type, so the total needs no query of its own.
        "count": sum(by_type.values()),
        "previous_count": previous,
        "by_type": by_type,
        "top_courses": top_courses,
    }


def _chat_courses(days: int | None) -> list | None:
    """The chat courses with the most messages in the period, or None when the chat backend fails."""
    path = f"/stats/courses?limit={TOP_COURSES}"
    if days is not None:
        path += f"&days={days}"
    try:
        return chat_client.call("GET", path)
    except HTTPException:
        # chat_client already logged the reason. null tells the console to show this part as unavailable.
        return None