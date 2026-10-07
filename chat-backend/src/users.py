"""Users: find the user behind a login identity, or create one."""

import secrets
import uuid
from uuid import UUID

import asyncpg

import db

# Attempts at a free random nickname before giving up (collisions are rare).
_NICKNAME_ATTEMPTS = 5


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
                    "insert into users (id, nickname) values ($1, $2)", new_id, _random_nickname()
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