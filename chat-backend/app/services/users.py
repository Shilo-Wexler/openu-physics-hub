"""Users: find the user behind a login identity or create one, and change nickname or avatar."""

import re
import secrets
import uuid
from uuid import UUID

import asyncpg

from app.core import db

# 3-30 characters: Hebrew or English letters, digits, space, underscore, hyphen, dot.
_NICKNAME_PATTERN = re.compile(r"[A-Za-z0-9א-ת _.-]{3,30}")

# Attempts at a free random nickname before giving up (collisions are rare).
_NICKNAME_ATTEMPTS = 5

# Ready-made avatars a user can pick from; the frontend draws each key as an icon.
# A new user gets a random one. Adding a key here (and its picture in the frontend) is enough.
AVATARS = frozenset({
    "atom", "orbit", "magnet", "zap", "lightbulb", "telescope", "rocket", "flask",
    "sigma", "infinity", "waves", "sun", "moon", "sparkles", "earth", "satellite",
})
_AVATAR_CHOICES = sorted(AVATARS)


def _random_nickname() -> str:
    return f"student{secrets.randbelow(900000) + 100000}"


async def find_or_create(provider: str, provider_user_id: str) -> UUID:
    """Return the user id for a login identity, creating a new user on first sign-in."""
    find = "select user_id from user_identities where provider = $1 and provider_user_id = $2"
    user_id = await db.pool.fetchval(find, provider, provider_user_id)
    if user_id is not None:
        return user_id

    for _ in range(_NICKNAME_ATTEMPTS):
        new_id = uuid.uuid4()
        try:
            async with db.pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "insert into users (id, nickname, avatar) values ($1, $2, $3)",
                    new_id, _random_nickname(), secrets.choice(_AVATAR_CHOICES),
                )
                await conn.execute(
                    "insert into user_identities (user_id, provider, provider_user_id)"
                    " values ($1, $2, $3)",
                    new_id, provider, provider_user_id,
                )
            return new_id
        except asyncpg.UniqueViolationError as exc:
            if exc.constraint_name == "users_nickname_unique":
                continue  # nickname taken: try another one
            if exc.constraint_name == "user_identities_pkey":
                # The same person signed in twice at once and the other request won.
                return await db.pool.fetchval(find, provider, provider_user_id)
            raise
    raise RuntimeError("could not find a free nickname")


class InvalidNickname(Exception):
    pass


class NicknameTaken(Exception):
    pass


class InvalidAvatar(Exception):
    pass


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
        raise NicknameTaken()
    if updated is None:
        raise PermissionError("user is blocked")
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
        raise PermissionError("user is blocked")
    return updated