"""Request dependencies shared by the routers: the session cookie and who is signed in."""

from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, Response

import sessions
import settings

SESSION_COOKIE = "session"


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.SESSION_DAYS * 24 * 60 * 60,
        httponly=True,  # page JavaScript cannot read it
        secure=True,  # sent over HTTPS only (browsers allow localhost too)
        samesite="lax",  # not sent on cross-site POSTs
    )


async def optional_user_id(
    response: Response, session: Annotated[str | None, Cookie()] = None
) -> UUID | None:
    """For routes open to everyone: the signed-in user, or None for a guest."""
    user_id = await sessions.get_user_id(session) if session else None
    if user_id is not None:
        # Re-send the cookie so its browser expiry slides along with the session.
        set_session_cookie(response, session)
    return user_id


async def current_user_id(
    user_id: Annotated[UUID | None, Depends(optional_user_id)],
) -> UUID:
    """For routes that need a signed-in user."""
    if user_id is None:
        raise HTTPException(status_code=401, detail="not signed in")
    return user_id