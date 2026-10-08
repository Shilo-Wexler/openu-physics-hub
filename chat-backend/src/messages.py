"""Course messages: read a page, post, edit, delete, like, report.

Replies are a flat list with a quote."""

from uuid import UUID

import asyncpg

import db
import profanity
from courses import CourseNotFound

# Messages per page; older ones are loaded with the id of the oldest message seen.
PAGE_SIZE = 50
# Same limit as the check on messages.content.
MAX_LENGTH = 4000

# Active messages of a course, newest first, with the quoted message and like counts.
# The quote is kept even when the quoted message was deleted (the app shows "deleted").
# Uses messages_course_idx; the cursor is (created_at, id) of the message given in $3.
_PAGE = """
    select m.id, m.user_id, u.nickname, m.content, m.created_at, m.edited_at,
           m.reply_to_id,
           p.deleted_at is not null                        as reply_to_deleted,
           case when p.deleted_at is null then pu.nickname end as reply_to_nickname,
           case when p.deleted_at is null then p.content end   as reply_to_content,
           (select count(*) from likes l where l.message_id = m.id) as like_count,
           exists (select 1 from likes l
                    where l.message_id = m.id and l.user_id = $2)   as liked_by_me
      from messages m
      join users u on u.id = m.user_id
      left join messages p on p.id = m.reply_to_id
      left join users pu on pu.id = p.user_id
     where m.course_id = $1 and m.deleted_at is null
       and ($3::bigint is null
            or (m.created_at, m.id) < (select created_at, id from messages where id = $3))
     order by m.created_at desc, m.id desc
     limit $4
"""


class InvalidContent(Exception):
    pass


class OffensiveContent(Exception):
    pass


class MessageNotFound(Exception):
    """Missing, deleted, or not written by this user."""


class ReplyTargetNotFound(Exception):
    pass


class AlreadyReported(Exception):
    pass


def _clean(content: str) -> str:
    content = content.strip()
    if not 1 <= len(content) <= MAX_LENGTH:
        raise InvalidContent()
    if profanity.contains_profanity(content):
        raise OffensiveContent()
    return content


async def list_for_course(
    course_id: int, viewer_id: UUID | None, before_id: int | None = None
) -> list[asyncpg.Record]:
    rows = await db.pool.fetch(_PAGE, course_id, viewer_id, before_id, PAGE_SIZE)
    # An empty page is normal; only then pay for checking that the course exists.
    if not rows and not await db.pool.fetchval(
        "select exists (select 1 from courses where id = $1)", course_id
    ):
        raise CourseNotFound()
    return rows


async def post(
    course_id: int, user_id: UUID, content: str, reply_to_id: int | None = None
) -> asyncpg.Record:
    content = _clean(content)
    try:
        # A reply must target an active message in the same course.
        row = await db.pool.fetchrow(
            """
            insert into messages (course_id, user_id, reply_to_id, content)
            select $1, $2, $3, $4
             where $3::bigint is null
                or exists (select 1 from messages
                            where id = $3 and course_id = $1 and deleted_at is null)
            returning id, created_at
            """,
            course_id, user_id, reply_to_id, content,
        )
    except asyncpg.ForeignKeyViolationError:
        raise CourseNotFound()
    except asyncpg.RaiseError as exc:
        # Raised by the reject_blocked_user trigger.
        raise PermissionError(str(exc)) from exc
    if row is None:
        raise ReplyTargetNotFound()
    return row


async def edit(message_id: int, user_id: UUID, content: str) -> asyncpg.Record:
    content = _clean(content)
    try:
        row = await db.pool.fetchrow(
            """
            update messages set content = $3, edited_at = now()
             where id = $1 and user_id = $2 and deleted_at is null
            returning id, edited_at
            """,
            message_id, user_id, content,
        )
    except asyncpg.RaiseError as exc:
        raise PermissionError(str(exc)) from exc
    if row is None:
        raise MessageNotFound()
    return row


async def delete(message_id: int, user_id: UUID) -> None:
    """Soft delete of the user's own message only; replies to it stay."""
    status = await db.pool.execute(
        """
        update messages set deleted_at = now(), deleted_by = $2
         where id = $1 and user_id = $2 and deleted_at is null
        """,
        message_id, user_id,
    )
    if status == "UPDATE 0":
        raise MessageNotFound()


async def like(message_id: int, user_id: UUID) -> None:
    """Idempotent: liking twice is not an error. Only active messages can be liked."""
    try:
        found = await db.pool.fetchval(
            """
            with target as (
                select id from messages where id = $1 and deleted_at is null
            ), added as (
                insert into likes (user_id, message_id)
                select $2, id from target
                on conflict do nothing
            )
            select exists (select 1 from target)
            """,
            message_id, user_id,
        )
    except asyncpg.RaiseError as exc:
        raise PermissionError(str(exc)) from exc
    if not found:
        raise MessageNotFound()


async def unlike(message_id: int, user_id: UUID) -> None:
    """Idempotent: removing a like that is not there is not an error."""
    await db.pool.execute(
        "delete from likes where message_id = $1 and user_id = $2", message_id, user_id
    )


async def report(message_id: int, user_id: UUID) -> None:
    try:
        report_id = await db.pool.fetchval(
            """
            insert into reports (message_id, reporter_id)
            select id, $2 from messages where id = $1 and deleted_at is null
            returning id
            """,
            message_id, user_id,
        )
    except asyncpg.UniqueViolationError:
        # reports_one_per_user: this user already reported this message.
        raise AlreadyReported()
    except asyncpg.RaiseError as exc:
        raise PermissionError(str(exc)) from exc
    if report_id is None:
        raise MessageNotFound()