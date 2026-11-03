"""Users: find the user behind a login identity or create one, change nickname or avatar,
and delete an account.

Deleting is in two steps. request_deletion marks the account and logs it out everywhere;
signing in again cancels it (cancel_deletion). A week later purge_due deletes it for real.
"""

import hashlib
import re
import secrets
import uuid
from datetime import timedelta
from uuid import UUID

import asyncpg
from app.core import db

# 3-30 characters: Hebrew or English letters, digits, space, underscore, hyphen, dot.
_NICKNAME_PATTERN = re.compile(r"[A-Za-z0-9א-ת _.-]{3,30}")

# Attempts at a free random nickname before giving up (collisions are rare).
_NICKNAME_ATTEMPTS = 5

# Ready-made avatars a user can pick from; the frontend shows each key as a picture
# (public-frontend/src/shared/assets/avatars/<key>.svg). A new user gets a random one.
# Adding a key here (and its picture in the frontend) is enough.
AVATARS = frozenset({
    "atom", "telescope", "microscope", "rocket", "satellite", "saturn",
    "test-tube", "dna", "magnet", "bulb", "comet", "galaxy",
    "flask", "sun", "moon", "earth", "lightning", "snowflake",
    "rainbow", "volcano", "owl", "fox", "octopus", "robot",
})

_AVATAR_CHOICES = sorted(AVATARS)

# Time between asking to delete an account and deleting it, so a mistake can be undone
# by signing in again. The site's texts say "a week": change them together.
DELETION_DELAY = timedelta(days=7)


class UserBlocked(Exception):
    """A blocked user tried to write. Raised here and by the services whose writes the
    reject_blocked_user trigger refuses (messages, likes, ratings, reports)."""


class InvalidNickname(Exception):
    pass


class NicknameTaken(Exception):
    pass


class InvalidAvatar(Exception):
    pass


def _random_nickname() -> str:
    return f"student{secrets.randbelow(900000) + 100000}"


def _hash_identity(provider_user_id: str) -> bytes:
    """What blocked_identities keeps instead of the provider's id."""
    return hashlib.sha256(provider_user_id.encode()).digest()


async def find_or_create(provider: str, provider_user_id: str) -> tuple[UUID, bool]:
    """Return (user id, is_new) for a login identity, creating a new user on first sign-in.

    A new user whose login belonged to a blocked user who deleted their account
    starts out blocked, with the original block time.
    """
    find = "select user_id from user_identities where provider = $1 and provider_user_id = $2"
    user_id = await db.pool.fetchval(find, provider, provider_user_id)
    if user_id is not None:
        return user_id, False

    for _ in range(_NICKNAME_ATTEMPTS):
        new_id = uuid.uuid4()
        try:
            async with db.pool.acquire() as conn, conn.transaction():
                # The block moves back onto the user. If the insert fails, the
                # transaction is rolled back and the row is still there.
                blocked_at = await conn.fetchval(
                    "delete from blocked_identities"
                    " where provider = $1 and provider_user_id_hash = $2"
                    " returning blocked_at",
                    provider, _hash_identity(provider_user_id),
                )
                await conn.execute(
                    "insert into users (id, nickname, avatar, blocked_at) values ($1, $2, $3, $4)",
                    new_id, _random_nickname(), secrets.choice(_AVATAR_CHOICES), blocked_at,
                )
                await conn.execute(
                    "insert into user_identities (user_id, provider, provider_user_id)"
                    " values ($1, $2, $3)",
                    new_id, provider, provider_user_id,
                )
            return new_id, True
        except asyncpg.UniqueViolationError as exc:
            if exc.constraint_name == "users_nickname_unique":
                continue  # nickname taken: try another one
            if exc.constraint_name == "user_identities_pkey":
                # The same person signed in twice at once and the other request won.
                return await db.pool.fetchval(find, provider, provider_user_id), False
            raise
    raise RuntimeError("could not find a free nickname")


async def get(user_id: UUID) -> asyncpg.Record | None:
    return await db.pool.fetchrow("select id, nickname, avatar from users where id = $1", user_id)


async def set_nickname(user_id: UUID, nickname: str) -> str:
    """Change a user's nickname and return it as saved. Blocked users cannot change it."""
    nickname = nickname.strip()
    if not _NICKNAME_PATTERN.fullmatch(nickname):
        raise InvalidNickname()
    try:
        updated = await db.pool.fetchval(
            """
            update users set nickname = $2
             where id = $1 and blocked_at is null
            returning nickname
            """,
            user_id, nickname,
        )
    except asyncpg.UniqueViolationError:
        raise NicknameTaken() from None
    if updated is None:
        raise UserBlocked()
    return updated


async def set_avatar(user_id: UUID, avatar: str) -> str:
    """Change a user's avatar to one of AVATARS. Blocked users cannot change it."""
    if avatar not in AVATARS:
        raise InvalidAvatar()
    updated = await db.pool.fetchval(
        "update users set avatar = $2 where id = $1 and blocked_at is null returning avatar",
        user_id, avatar,
    )
    if updated is None:
        raise UserBlocked()
    return updated


async def request_deletion(user_id: UUID) -> None:
    """Mark the account for deletion and log it out on every device.

    Nothing else changes yet: the user's messages stay as they are until purge_due.
    Blocked users may delete their account too.
    """
    async with db.pool.acquire() as conn, conn.transaction():
        # coalesce keeps the first request's time, so asking twice does not delay it.
        await conn.execute(
            "update users set deletion_requested_at = coalesce(deletion_requested_at, now())"
            " where id = $1",
            user_id,
        )
        await conn.execute("delete from sessions where user_id = $1", user_id)


async def cancel_deletion(user_id: UUID) -> bool:
    """Called on every sign-in. Returns True when it cancelled a pending deletion."""
    cancelled = await db.pool.fetchval(
        "update users set deletion_requested_at = null"
        " where id = $1 and deletion_requested_at is not null"
        " returning true",
        user_id,
    )
    return bool(cancelled)


async def purge_due() -> int:
    """Delete every account whose deletion was asked for at least DELETION_DELAY ago.

    Each account is deleted in its own transaction, so one failure does not undo the others.
    Returns how many accounts were deleted.
    """
    due = await db.pool.fetch(
        "select id from users where deletion_requested_at <= now() - $1::interval",
        DELETION_DELAY,
    )
    purged = 0
    for row in due:
        async with db.pool.acquire() as conn, conn.transaction():
            if await _purge(conn, row["id"]):
                purged += 1
    return purged


async def _purge(conn: asyncpg.Connection, user_id: UUID) -> bool:
    """Delete one account and everything that identifies it.

    The user's messages are not removed from the table: a review may carry the replies of
    others. They are marked deleted (an earlier deletion is kept as it was), emptied, and
    lose their author. Returns False if the deletion was cancelled in the meantime.
    """
    # for update: a sign-in at the same moment waits, and then finds no pending deletion.
    user = await conn.fetchrow(
        "select blocked_at from users"
        " where id = $1 and deletion_requested_at <= now() - $2::interval"
        " for update",
        user_id, DELETION_DELAY,
    )
    if user is None:
        return False

    if user["blocked_at"] is not None:
        identities = await conn.fetch(
            "select provider, provider_user_id from user_identities where user_id = $1", user_id
        )
        await conn.executemany(
            """
            insert into blocked_identities (provider, provider_user_id_hash, blocked_at)
            values ($1, $2, $3)
            on conflict (provider, provider_user_id_hash) do update set blocked_at = excluded.blocked_at
            """,
            [
                (i["provider"], _hash_identity(i["provider_user_id"]), user["blocked_at"])
                for i in identities
            ],
        )

    # Take back the user's likes from like_count before deleting them.
    await conn.execute(
        """
        update messages m set like_count = m.like_count - 1
          from likes l
         where l.message_id = m.id and l.user_id = $1
        """,
        user_id,
    )
    await conn.execute("delete from likes where user_id = $1", user_id)
    await conn.execute("delete from ratings where user_id = $1", user_id)
    await conn.execute("delete from reports where reporter_id = $1", user_id)
    await conn.execute("delete from sessions where user_id = $1", user_id)
    # user_id is cleared in the same update as content, so the blocked-user trigger
    # sees no author and lets it through.
    await conn.execute(
        """
        update messages
           set user_id = null, content = '',
               deleted_at = coalesce(deleted_at, now()),
               deleted_by = coalesce(deleted_by, 'author')
         where user_id = $1
        """,
        user_id,
    )
    await conn.execute("delete from user_identities where user_id = $1", user_id)
    await conn.execute("delete from users where id = $1", user_id)
    return True
