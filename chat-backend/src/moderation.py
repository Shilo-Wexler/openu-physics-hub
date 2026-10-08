"""Moderation for the admin console: reported messages, removing messages, blocking users.

Called only through the /internal routes, by the admin backend (not by browsers).
"""

from uuid import UUID

import asyncpg

import db
from messages import MessageNotFound

# Most reported messages returned in one list; the console shows the worst first.
REPORTED_LIMIT = 100

# Active messages with open reports, most reported first, with the author's history:
# how many of their messages moderators removed, and how many were ever reported.
_REPORTED = """
    with open_reports as (
        select message_id, count(*) as report_count, max(created_at) as last_reported_at
          from reports
         where status = 'open'
         group by message_id
    )
    select m.id as message_id, m.course_id, c.name as course_name, m.content, m.created_at,
           m.user_id as author_id, u.nickname as author_nickname,
           u.blocked_at is not null as author_blocked,
           r.report_count, r.last_reported_at,
           (select count(*) from messages x
             where x.user_id = m.user_id and x.deleted_by = 'moderator') as author_removed_count,
           (select count(*) from messages x
             where x.user_id = m.user_id
               and exists (select 1 from reports rp where rp.message_id = x.id))
                                                                    as author_reported_count
      from open_reports r
      join messages m on m.id = r.message_id and m.deleted_at is null
      join users u on u.id = m.user_id
      join courses c on c.id = m.course_id
     order by r.report_count desc, r.last_reported_at desc
     limit $1
"""


class UserNotFound(Exception):
    pass


async def reported_messages() -> list[asyncpg.Record]:
    return await db.pool.fetch(_REPORTED, REPORTED_LIMIT)


async def dismiss(message_id: int) -> int:
    """Close the message's open reports and keep the message. Returns how many were closed."""
    status = await db.pool.execute(
        "update reports set status = 'dismissed' where message_id = $1 and status = 'open'",
        message_id,
    )
    return int(status.split()[-1])


async def remove(message_id: int) -> None:
    """Delete the message as a moderator and close its open reports, together."""
    async with db.pool.acquire() as conn, conn.transaction():
        # coalesce keeps the original deletion if the author already deleted it.
        found = await conn.fetchval(
            """
            update messages
               set deleted_at = coalesce(deleted_at, now()),
                   deleted_by = coalesce(deleted_by, 'moderator')
             where id = $1
            returning id
            """,
            message_id,
        )
        if found is None:
            raise MessageNotFound()
        await conn.execute(
            "update reports set status = 'resolved' where message_id = $1 and status = 'open'",
            message_id,
        )


async def block(user_id: UUID) -> None:
    # coalesce keeps the original time if the user is already blocked.
    found = await db.pool.fetchval(
        "update users set blocked_at = coalesce(blocked_at, now()) where id = $1 returning id",
        user_id,
    )
    if found is None:
        raise UserNotFound()


async def unblock(user_id: UUID) -> None:
    found = await db.pool.fetchval(
        "update users set blocked_at = null where id = $1 returning id", user_id
    )
    if found is None:
        raise UserNotFound()


async def blocked_users() -> list[asyncpg.Record]:
    return await db.pool.fetch(
        """
        select u.id as user_id, u.nickname, u.blocked_at,
               (select count(*) from messages x
                 where x.user_id = u.id and x.deleted_by = 'moderator') as removed_count
          from users u
         where u.blocked_at is not null
         order by u.blocked_at desc
        """
    )


async def removed_messages(user_id: UUID) -> list[asyncpg.Record]:
    """Messages of a user that moderators removed, newest removal first."""
    rows = await db.pool.fetch(
        """
        select m.id as message_id, m.course_id, c.name as course_name, m.content,
               m.created_at, m.deleted_at as removed_at
          from messages m
          join courses c on c.id = m.course_id
         where m.user_id = $1 and m.deleted_by = 'moderator'
         order by m.deleted_at desc
        """,
        user_id,
    )
    # An empty list is normal; only then pay for checking that the user exists.
    if not rows and not await db.pool.fetchval(
        "select exists (select 1 from users where id = $1)", user_id
    ):
        raise UserNotFound()
    return rows