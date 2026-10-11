"""Course reviews and their discussions: read, post, edit, delete, like, report.

A review is a top-level message. Its replies form one flat discussion under it;
a reply may quote another reply in the same discussion."""

from typing import Literal
from uuid import UUID

import asyncpg

from app.core import db
from app.services import profanity
from app.services.courses import CourseNotFound

# Reviews per page, and replies per page of one discussion.
PAGE_SIZE = 50
# Same limit as the check on messages.content.
MAX_LENGTH = 4000

Sort = Literal["new", "top"]

# Fields shared by reviews and replies. A deleted review keeps its place (it may have
# replies) but shows no author, avatar or text. $2 is the viewer, null for a guest.
_FIELDS = """
    m.id, m.user_id, m.created_at, m.edited_at, m.like_count,
    m.deleted_at is not null                            as deleted,
    case when m.deleted_at is null then u.nickname end  as nickname,
    case when m.deleted_at is null then u.avatar end    as avatar,
    case when m.deleted_at is null then m.content end   as content,
    exists (select 1 from likes l
             where l.message_id = m.id and l.user_id = $2) as liked_by_me
"""

# Reviews of a course with their reply counts. A deleted review is listed only while
# it still has active replies. The cursor ($3) is the id of the last review seen.
_REVIEWS = f"""
    select {_FIELDS},
           (select count(*) from messages r
             where r.thread_id = m.id and r.deleted_at is null) as reply_count
      from messages m
      join users u on u.id = m.user_id
     where m.course_id = $1 and m.thread_id is null
       and {{filter}}
     order by {{order}}
     limit $4
"""

# Newest first, uses messages_reviews_new_idx.
_REVIEWS_NEW = _REVIEWS.format(
    filter="""(m.deleted_at is null
            or exists (select 1 from messages r
                        where r.thread_id = m.id and r.deleted_at is null))
       and ($3::bigint is null
            or (m.created_at, m.id) < (select created_at, id from messages where id = $3))""",
    order="m.created_at desc, m.id desc",
)

# Most liked first, uses messages_reviews_top_idx. Likes change while someone pages,
# so a review can move between pages; the frontend drops ids it already shows.
_REVIEWS_TOP = _REVIEWS.format(
    filter="""m.deleted_at is null
       and ($3::bigint is null
            or (m.like_count, m.id) < (select like_count, id from messages where id = $3))""",
    order="m.like_count desc, m.id desc",
)

# Active replies of one review, oldest first, with the quoted reply if there is one.
# The quote is kept even when the quoted reply was deleted (the app shows "deleted").
# Uses messages_thread_idx; the cursor ($3) is the id of the last reply seen.
_REPLIES = f"""
    select {_FIELDS},
           m.reply_to_id,
           q.deleted_at is not null                            as reply_to_deleted,
           case when q.deleted_at is null then qu.nickname end as reply_to_nickname,
           case when q.deleted_at is null then q.content end   as reply_to_content
      from messages m
      join users u on u.id = m.user_id
      left join messages q on q.id = m.reply_to_id
      left join users qu on qu.id = q.user_id
     where m.thread_id = $1 and m.deleted_at is null
       and ($3::bigint is null
            or (m.created_at, m.id) > (select created_at, id from messages where id = $3))
     order by m.created_at, m.id
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


async def list_reviews(
    course_id: int, viewer_id: UUID | None, sort: Sort = "new", before_id: int | None = None
) -> list[asyncpg.Record]:
    query = _REVIEWS_NEW if sort == "new" else _REVIEWS_TOP
    rows = await db.pool.fetch(query, course_id, viewer_id, before_id, PAGE_SIZE)
    # An empty page is normal; only then pay for checking that the course exists.
    if not rows and not await db.pool.fetchval(
        "select exists (select 1 from courses where id = $1)", course_id
    ):
        raise CourseNotFound()
    return rows


async def list_replies(
    review_id: int, viewer_id: UUID | None, after_id: int | None = None
) -> list[asyncpg.Record]:
    rows = await db.pool.fetch(_REPLIES, review_id, viewer_id, after_id, PAGE_SIZE)
    if not rows and not await db.pool.fetchval(
        "select exists (select 1 from messages where id = $1 and thread_id is null)", review_id
    ):
        raise MessageNotFound()
    return rows


async def post(
    course_id: int, user_id: UUID, content: str, reply_to_id: int | None = None
) -> asyncpg.Record:
    """Post a review, or a reply when reply_to_id is given.

    Replying to a review starts or continues its discussion; replying to a reply adds
    to the same discussion and quotes that reply. There is never a deeper level."""
    content = _clean(content)
    thread_id = quote_id = None
    if reply_to_id is not None:
        target = await db.pool.fetchrow(
            """
            select id, thread_id from messages
             where id = $1 and course_id = $2 and deleted_at is null
            """,
            reply_to_id, course_id,
        )
        if target is None:
            raise ReplyTargetNotFound()
        if target["thread_id"] is None:
            thread_id = target["id"]
        else:
            thread_id, quote_id = target["thread_id"], target["id"]
    try:
        return await db.pool.fetchrow(
            """
            insert into messages (course_id, user_id, thread_id, reply_to_id, content)
            values ($1, $2, $3, $4, $5)
            returning id, thread_id, reply_to_id, created_at
            """,
            course_id, user_id, thread_id, quote_id, content,
        )
    except asyncpg.ForeignKeyViolationError:
        raise CourseNotFound()
    except asyncpg.RaiseError as exc:
        # Raised by the reject_blocked_user trigger.
        raise PermissionError(str(exc)) from exc


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
        update messages set deleted_at = now(), deleted_by = 'author'
         where id = $1 and user_id = $2 and deleted_at is null
        """,
        message_id, user_id,
    )
    if status == "UPDATE 0":
        raise MessageNotFound()


async def like(message_id: int, user_id: UUID) -> None:
    """Idempotent: liking twice is not an error. Only active messages can be liked."""
    async with db.pool.acquire() as conn, conn.transaction():
        # Lock the message row, so concurrent likes update like_count one after another.
        found = await conn.fetchval(
            "select true from messages where id = $1 and deleted_at is null for update",
            message_id,
        )
        if not found:
            raise MessageNotFound()
        try:
            added = await conn.fetchval(
                """
                insert into likes (user_id, message_id) values ($1, $2)
                on conflict do nothing
                returning true
                """,
                user_id, message_id,
            )
        except asyncpg.RaiseError as exc:
            raise PermissionError(str(exc)) from exc
        if added:
            await conn.execute(
                "update messages set like_count = like_count + 1 where id = $1", message_id
            )


async def unlike(message_id: int, user_id: UUID) -> None:
    """Idempotent: removing a like that is not there is not an error."""
    async with db.pool.acquire() as conn, conn.transaction():
        removed = await conn.fetchval(
            "delete from likes where message_id = $1 and user_id = $2 returning true",
            message_id, user_id,
        )
        if removed:
            await conn.execute(
                "update messages set like_count = like_count - 1 where id = $1", message_id
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