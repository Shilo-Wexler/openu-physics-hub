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

# Users and messages for one period and the period before it, in one round trip.
# users_total leaves out accounts waiting to be deleted: they are gone from the
# user's point of view, and deletion_pending counts them on their own.
# posts are reviews and general chat posts (thread_id null); replies are the rest.
# Like the courses list, only messages still in the chat are counted.
_SUMMARY_PERIOD = """
    with bounds as (
      select now() - make_interval(days => $1)     as start,
             now() - make_interval(days => $1 * 2) as previous_start
    )
    select
      (select count(*) from users where deletion_requested_at is null)     as users_total,
      (select count(*) from users where deletion_requested_at is not null) as deletion_pending,
      (select count(*) from users, bounds
        where created_at >= bounds.start)                                  as users_new,
      (select count(*) from users, bounds
        where created_at >= bounds.previous_start
          and created_at < bounds.start)                                   as users_new_previous,
      count(*) filter (where m.thread_id is null and m.created_at >= b.start)     as posts,
      count(*) filter (where m.thread_id is null and m.created_at < b.start)      as posts_previous,
      count(*) filter (where m.thread_id is not null and m.created_at >= b.start) as replies,
      count(*) filter (where m.thread_id is not null and m.created_at < b.start)  as replies_previous
      from bounds b
      left join messages m
        on m.deleted_at is null and m.created_at >= b.previous_start
     group by b.start
"""

# All time: no "new" or "previous" numbers, since every user and message is in the period.
_SUMMARY_ALL = """
    select
      (select count(*) from users where deletion_requested_at is null)     as users_total,
      (select count(*) from users where deletion_requested_at is not null) as deletion_pending,
      null::bigint as users_new,
      null::bigint as users_new_previous,
      count(*) filter (where thread_id is null)     as posts,
      null::bigint                                  as posts_previous,
      count(*) filter (where thread_id is not null) as replies,
      null::bigint                                  as replies_previous
      from messages
     where deleted_at is null
"""


async def active_courses(limit: int, days: int | None) -> list[asyncpg.Record]:
    """The courses with the most messages written in the last `days` days (all time when None).
    The general chat is a course too, so it can appear in the list."""
    if days is None:
        return await db.pool.fetch(_ACTIVE_COURSES.format(period=""), limit)
    return await db.pool.fetch(_ACTIVE_COURSES.format(period=_IN_PERIOD), limit, days)


async def summary(days: int | None) -> asyncpg.Record:
    """Users, posts and replies in the last `days` days and the `days` before them
    (all time when None, with the "new" and "previous" numbers left as None)."""
    if days is None:
        return await db.pool.fetchrow(_SUMMARY_ALL)
    return await db.pool.fetchrow(_SUMMARY_PERIOD, days)