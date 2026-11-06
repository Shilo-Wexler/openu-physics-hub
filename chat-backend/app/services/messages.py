"""Course reviews and their discussions: read, post, edit, delete, like, report.

A review is a top-level message. Its replies form one flat discussion under it;
a reply may quote another reply in the same discussion."""

import time
from typing import Literal
from uuid import UUID

import asyncpg
from app.core import db
from app.services import profanity
from app.services.courses import CourseNotFound
from app.services.users import UserBlocked

# Reviews per page, and replies per page of one discussion.
PAGE_SIZE = 50
# Same limit as the messages_content_length check on messages.content.
MAX_LENGTH = 4000
# Posting limits per user, reviews and replies together. Far above what a person writes,
# low enough to stop a script. Deleted messages count too, so deleting does not reset them.
POSTS_PER_MINUTE = 10
POSTS_PER_HOUR = 100

# The home page's "new in the chat" row: how many reviews, how long the start of each
# one may be, and how long one answer is reused before asking the database again.
LATEST_COUNT = 4
SNIPPET_LENGTH = 200
LATEST_CACHE_SECONDS = 30

Sort = Literal["new", "top"]

# Fields shared by reviews and replies. A deleted review keeps its place (it may have
# replies) but shows no author, avatar or text. $2 is the viewer, null for a guest.
_FIELDS = """
    m.id, m.created_at, m.edited_at, m.like_count,
    m.deleted_at is not null                            as deleted,
    case when m.deleted_at is null then m.user_id end   as user_id,
    case when m.deleted_at is null then u.nickname end  as nickname,
    case when m.deleted_at is null then u.avatar end    as avatar,
    case when m.deleted_at is null then m.content end   as content,
    exists (select 1 from likes l
             where l.message_id = m.id and l.user_id = $2) as liked_by_me
"""

# Active replies under the review m.
_REPLY_COUNT = """
    (select count(*) from messages r
      where r.thread_id = m.id and r.deleted_at is null) as reply_count
"""

# A deleted review is shown only while it still has active replies.
_REVIEW_VISIBLE = """
    (m.deleted_at is null
     or exists (select 1 from messages r
                 where r.thread_id = m.id and r.deleted_at is null))
"""

# Reviews of a course with their reply counts. The cursor ($3) is the id of the last
# review seen. left join: the author of a deleted review may have deleted their account.
_REVIEWS = f"""
    select {_FIELDS}, {_REPLY_COUNT}
      from messages m
      left join users u on u.id = m.user_id
     where m.course_id = $1 and m.thread_id is null
       and {{filter}}
     order by {{order}}
     limit $4
"""

# Newest first, uses messages_reviews_new_idx.
_REVIEWS_NEW = _REVIEWS.format(
    filter=f"""{_REVIEW_VISIBLE}
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

# The newest active reviews of all courses, for the home page. Only what the card shows:
# no author id, no times. An active review always has an author, so the joins stay inner.
_LATEST = f"""
    select m.id, m.course_id, c.name as course_name,
           u.nickname, u.avatar, m.content, m.like_count,
           {_REPLY_COUNT}
      from messages m
      join users u on u.id = m.user_id
      join courses c on c.id = m.course_id
     where m.thread_id is null and m.deleted_at is null
     order by m.created_at desc, m.id desc
     limit $1
"""

# Active replies of one review, oldest first, with the quoted reply if there is one.
# The quote is kept even when the quoted reply was deleted (the app shows "deleted").
# An active reply always has an author, so its own join stays inner.
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

# The review a shared message ($1) belongs to: the message itself when it is a review,
# otherwise the review of its discussion. A deleted reply is not shared; a deleted
# review follows the same rule as in the list. Two primary key lookups.
# left join for the same reason as in _REVIEWS.
_SHARED = f"""
    select {_FIELDS}, {_REPLY_COUNT}, m.course_id
      from messages s
      join messages m on m.id = coalesce(s.thread_id, s.id)
      left join users u on u.id = m.user_id
     where s.id = $1
       and (s.thread_id is null or s.deleted_at is null)
       and {_REVIEW_VISIBLE}
"""

# How many messages user $1 posted in the last minute and hour.
# Uses messages_user_created_idx.
_RECENT_POSTS = """
    select count(*) filter (where created_at > now() - interval '1 minute') as last_minute,
           count(*)                                                         as last_hour
      from messages
     where user_id = $1 and created_at > now() - interval '1 hour'
"""

# The last answer of latest(): (when it was made, by time.monotonic(), the items).
_latest_cache: tuple[float, list[dict]] | None = None


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


class TooManyMessages(Exception):
    """Over POSTS_PER_MINUTE or POSTS_PER_HOUR."""


def _clean(content: str) -> str:
    content = content.strip()
    if not 1 <= len(content) <= MAX_LENGTH:
        raise InvalidContent()
    if profanity.contains_profanity(content):
        raise OffensiveContent()
    return content


def _snippet(content: str) -> str:
    """The start of a message, on one line: line breaks and runs of spaces become one
    space, and a long text is cut at the last whole word before SNIPPET_LENGTH."""
    text = " ".join(content.split())
    if len(text) <= SNIPPET_LENGTH:
        return text
    cut = text[:SNIPPET_LENGTH]
    space = cut.rfind(" ")
    # One very long word (a link, "aaaa...") has no space to cut at: cut inside it.
    if space > SNIPPET_LENGTH // 2:
        cut = cut[:space]
    return cut.rstrip(" .,;:-") + "…"


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


async def latest() -> list[dict]:
    """The newest reviews of all courses for the home page, each with the start of its text
    instead of the full text. Every visitor gets the same answer, so it is kept for
    LATEST_CACHE_SECONDS: the database is asked at most once in that time per server."""
    global _latest_cache
    now = time.monotonic()
    if _latest_cache is not None and now - _latest_cache[0] < LATEST_CACHE_SECONDS:
        return _latest_cache[1]
    rows = await db.pool.fetch(_LATEST, LATEST_COUNT)
    items = []
    for row in rows:
        item = dict(row)
        item["snippet"] = _snippet(item.pop("content"))
        items.append(item)
    _latest_cache = (now, items)
    return items


async def list_replies(
    review_id: int, viewer_id: UUID | None, after_id: int | None = None
) -> list[asyncpg.Record]:
    rows = await db.pool.fetch(_REPLIES, review_id, viewer_id, after_id, PAGE_SIZE)
    if not rows and not await db.pool.fetchval(
        "select exists (select 1 from messages where id = $1 and thread_id is null)", review_id
    ):
        raise MessageNotFound()
    return rows


async def get_shared(message_id: int, viewer_id: UUID | None) -> asyncpg.Record:
    """The review to show for a shared link to a review or a reply."""
    row = await db.pool.fetchrow(_SHARED, message_id, viewer_id)
    if row is None:
        raise MessageNotFound()
    return row


async def post(
    course_id: int, user_id: UUID, content: str, reply_to_id: int | None = None
) -> asyncpg.Record:
    """Post a review, or a reply when reply_to_id is given.

    Replying to a review starts or continues its discussion; replying to a reply adds
    to the same discussion and quotes that reply. There is never a deeper level."""
    content = _clean(content)
    async with db.pool.acquire() as conn, conn.transaction():
        # One post at a time per user, so parallel requests cannot all pass the count.
        await conn.execute(
            "select pg_advisory_xact_lock(hashtext('messages.post'), hashtext($1))",
            str(user_id),
        )
        recent = await conn.fetchrow(_RECENT_POSTS, user_id)
        if recent["last_minute"] >= POSTS_PER_MINUTE or recent["last_hour"] >= POSTS_PER_HOUR:
            raise TooManyMessages()

        thread_id = quote_id = None
        if reply_to_id is not None:
            target = await conn.fetchrow(
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
            return await conn.fetchrow(
                """
                insert into messages (course_id, user_id, thread_id, reply_to_id, content)
                values ($1, $2, $3, $4, $5)
                returning id, thread_id, reply_to_id, created_at
                """,
                course_id, user_id, thread_id, quote_id, content,
            )
        except asyncpg.ForeignKeyViolationError:
            raise CourseNotFound() from None
        except asyncpg.RaiseError:
            # Raised by the reject_blocked_user trigger.
            raise UserBlocked() from None


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
    except asyncpg.RaiseError:
        raise UserBlocked() from None
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
        except asyncpg.RaiseError:
            raise UserBlocked() from None
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
        raise AlreadyReported() from None
    except asyncpg.RaiseError:
        raise UserBlocked() from None
    if report_id is None:
        raise MessageNotFound()
    