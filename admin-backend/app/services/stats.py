"""Numbers for the console's stats screen, for one period.

Inquiry and site visit numbers come from this DB. Chat numbers (the most active courses, users,
posts and replies) come from the chat backend's /internal API (chat_client); when the chat backend
fails, only those parts are None and the rest of the screen still works.
"""

from datetime import datetime, timedelta
from typing import get_args

from psycopg import Connection

from app.schemas.inquiries import InquiryType
from app.services import chat_client, visits

# How many courses each top list shows.
TOP_COURSES = 5

TYPES: tuple[str, ...] = get_args(InquiryType)


def inquiries(conn: Connection, span: timedelta | None) -> dict:
    """Inquiry count, count in the previous period of the same length, count by type and the top courses."""
    where = "where created_at >= now() - %(span)s" if span is not None else ""
    params = {"span": span, "top": TOP_COURSES}

    by_type = dict.fromkeys(TYPES, 0)
    for row in conn.execute(f"select type, count(*) as n from inquiries {where} group by type", params):
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

    top_courses = conn.execute(
        f"""
        select t.course_number, c.name as course_name, t.inquiry_count
        from (
            select course_number, count(*) as inquiry_count
            from inquiries {where}
            group by course_number
            order by inquiry_count desc, course_number
            limit %(top)s
        ) t
        join courses c on c.course_number = t.course_number
        order by t.inquiry_count desc, t.course_number
        """,
        params,
    ).fetchall()

    return {
        "count": sum(by_type.values()),
        "previous_count": previous,
        "by_type": by_type,
        "top_courses": top_courses,
    }


def site_visits(conn: Connection, days: int | None) -> dict | None:
    """Visits to the public site in the last `days` calendar days (today included, Israel time),
    and in the `days` before them. None when the table is still empty (the sync job never ran).

    since is the first day the table has, so the console can say "counted since". previous_count
    is None when the table does not reach back over the whole previous period, since a partial
    number would make the change look bigger than it is.
    """
    bounds = conn.execute(
        "select min(day) as since, max(updated_at) as updated_at from site_visits"
    ).fetchone()
    if bounds["since"] is None:
        return None

    if days is None:
        count = conn.execute("select coalesce(sum(visits), 0) as n from site_visits").fetchone()["n"]
        previous = None
    else:
        today = datetime.now(visits.SITE_TIMEZONE).date()
        start = today - timedelta(days=days - 1)
        previous_start = start - timedelta(days=days)
        row = conn.execute(
            """
            select coalesce(sum(visits) filter (where day >= %(start)s), 0) as n,
                   coalesce(sum(visits) filter (where day < %(start)s), 0) as previous
            from site_visits
            where day >= %(previous_start)s
            """,
            {"start": start, "previous_start": previous_start},
        ).fetchone()
        count = row["n"]
        previous = row["previous"] if bounds["since"] <= previous_start else None

    return {
        "count": count,
        "previous_count": previous,
        "since": bounds["since"],
        "updated_at": bounds["updated_at"],
    }


def chat_courses(days: int | None) -> list | None:
    """The chat courses with the most messages in the period, or None when the chat backend fails."""
    path = f"/stats/courses?limit={TOP_COURSES}"
    if days is not None:
        path += f"&days={days}"
    try:
        return chat_client.call("GET", path)
    except chat_client.ChatError:
        # chat_client already logged the reason. None tells the console to show this part as unavailable.
        return None


def chat_summary(days: int | None) -> dict | None:
    """Users, posts and replies in the period and the one before it, and accounts waiting to be
    deleted, or None when the chat backend fails."""
    path = "/stats/summary"
    if days is not None:
        path += f"?days={days}"
    try:
        return chat_client.call("GET", path)
    except chat_client.ChatError:
        return None