"""Login sessions: create, look up and delete. See db/migrations/002_sessions.sql."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import db
import settings

# last_seen_at is refreshed at most this often, to avoid a DB write on every request.
_TOUCH_INTERVAL = timedelta(days=1)


def _hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


async def create(user_id: UUID) -> str:
    """Create a session and return the token to put in the browser cookie."""
    token = secrets.token_urlsafe(32)
    await db.pool.execute(
        "insert into sessions (token_hash, user_id) values ($1, $2)", _hash(token), user_id
    )
    return token


async def get_user_id(token: str) -> UUID | None:
    """Return the user of a valid session, or None if the token is unknown or expired."""
    token_hash = _hash(token)
    row = await db.pool.fetchrow(
        "select user_id, last_seen_at from sessions where token_hash = $1", token_hash
    )
    if row is None:
        return None
    idle = datetime.now(timezone.utc) - row["last_seen_at"]
    if idle > timedelta(days=settings.SESSION_DAYS):
        await db.pool.execute("delete from sessions where token_hash = $1", token_hash)
        return None
    if idle > _TOUCH_INTERVAL:
        await db.pool.execute(
            "update sessions set last_seen_at = now() where token_hash = $1", token_hash
        )
    return row["user_id"]


async def delete(token: str) -> None:
    """Log out on this browser."""
    await db.pool.execute("delete from sessions where token_hash = $1", _hash(token))


async def delete_all(user_id: UUID) -> None:
    """Log out on every device."""
    await db.pool.execute("delete from sessions where user_id = $1", user_id)