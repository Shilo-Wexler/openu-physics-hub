"""Activity numbers for the admin console's stats screen.

Called only through the /internal routes, by the admin backend (not by browsers).
"""

import asyncpg
from app.core import db

# Most courses one request may ask for. The console shows a short top list, never all courses.
MAX_LIMIT = 20

# Messages still in the chat, counted per course, most active first.
# Deleted messages are left out, so spam a moderator removed does not make a course look busy.
# The period filter is a separate fragment (not "$2 is null or ..."), so each variant gets
# its own plan and the period one can use messages_created_idx.
_ACTIVE_COURSES = """
    select c.id as course_id, c.name as course_name, t.message_count
      from (select course_id, count(*) as message_count
              from messages
             where deleted_at is null {period}
             group by course_id
             order by message_count desc, course_id
             limit $1) t
      join courses c on c.id = t.course_id
     order by t.message_count desc, c.id
"""
_IN_PERIOD = "and created_at >= now() - make_interval(days => $2)"


async def active_courses(limit: int, days: int | None) -> list[asyncpg.Record]:
    """The courses with the most messages written in the last `days` days (all time when None).
    The general chat is a course too, so it can appear in the list."""
    if days is None:
        return await db.pool.fetch(_ACTIVE_COURSES.format(period=""), limit)
    return await db.pool.fetch(_ACTIVE_COURSES.format(period=_IN_PERIOD), limit, days)