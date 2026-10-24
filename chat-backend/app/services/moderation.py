"""Moderation for the admin console: reported messages, removing messages, blocking users,
and undoing a dismissal or a removal.

Called only through the /internal routes, by the admin backend (not by browsers).
"""

from uuid import UUID

import asyncpg

from app.core import db
from app.services.messages import MessageNotFound

# Most reported messages returned in one list; the console shows the worst first.
REPORTED_LIMIT = 100
# Most ids one details request may ask for: more than a page of the console's moderation log.
MAX_IDS = 200

# Active messages with open reports, most reported first, with the author's history:
# how many of their messages moderators removed, and how many were ever reported.
# An active message always has an author, so the users join stays inner.
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

# Any messages by id, deleted ones too, for the console's log: what was written, by whom, where,
# what became of it (state) and its reports. Reports per message are few, so counting them is cheap.
# left join: when the author deleted their account, author_id and author_nickname are null
# and content is empty.
_MESSAGES = """
    select m.id as message_id, m.course_id, c.name as course_name, m.content, m.created_at,
           m.user_id as author_id, u.nickname as author_nickname,
           case when m.deleted_at is null then 'active'
                when m.deleted_by = 'moderator' then 'removed'
                else 'deleted' end as state,
           (select count(*) from reports r where r.message_id = m.id and r.status = 'open') as open_reports,
           (select count(*) from reports r where r.message_id = m.id) as all_reports
      from messages m
      left join users u on u.id = m.user_id
      join courses c on c.id = m.course_id
     where m.id = any($1::bigint[])
"""


class UserNotFound(Exception):
    pass


class NothingToUndo(Exception):
    """The message is no longer as the action left it (handled again since), so there is nothing to undo."""


async def reported_messages() -> list[asyncpg.Record]:
    return await db.pool.fetch(_REPORTED, REPORTED_LIMIT)


async def dismiss(message_id: int) -> int:
    """Close the message's open reports and keep the message. Returns how many were closed."""
    status = await db.pool.execute(
        "update reports set status = 'dismissed' where message_id = $1 and status = 'open'",
        message_id,
    )
    return int(status.split()[-1])


async def reopen(message_id: int) -> int:
    """Undo a dismissal: the message's dismissed reports are open again, so it is back in the
    reports list for a new decision. Only while the message is still in the chat.
    Returns how many reports were reopened."""
    async with db.pool.acquire() as conn, conn.transaction():
        # for update: a removal at the same moment waits, so the check below stays true.
        row = await conn.fetchrow(
            "select deleted_at from messages where id = $1 for update", message_id
        )
        if row is None:
            raise MessageNotFound()
        if row["deleted_at"] is not None:
            raise NothingToUndo()
        status = await conn.execute(
            "update reports set status = 'open' where message_id = $1 and status = 'dismissed'",
            message_id,
        )
        reopened = int(status.split()[-1])
        if reopened == 0:
            raise NothingToUndo()
        return reopened


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


async def restore(message_id: int) -> int:
    """Undo a removal: the message is back in the chat, and the reports closed with it are open again,
    so it is back in the reports list for a new decision. Only for a message a moderator removed,
    never one its author deleted, and not once the author deleted their account (the message
    was emptied). Returns how many reports were reopened."""
    async with db.pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "select deleted_by, user_id from messages where id = $1 for update", message_id
        )
        if row is None:
            raise MessageNotFound()
        if row["deleted_by"] != "moderator" or row["user_id"] is None:
            raise NothingToUndo()
        await conn.execute(
            "update messages set deleted_at = null, deleted_by = null where id = $1", message_id
        )
        status = await conn.execute(
            "update reports set status = 'open' where message_id = $1 and status = 'resolved'",
            message_id,
        )
        return int(status.split()[-1])


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


async def messages_by_id(ids: list[int]) -> list[asyncpg.Record]:
    """Details of these messages, in no set order. Ids that don't exist are left out."""
    return await db.pool.fetch(_MESSAGES, ids)


async def users_by_id(ids: list[UUID]) -> list[asyncpg.Record]:
    """Nickname and block state of these users, in no set order. Ids that don't exist are left out."""
    return await db.pool.fetch(
        "select id as user_id, nickname, blocked_at from users where id = any($1::uuid[])", ids
    )
