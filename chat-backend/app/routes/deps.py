"""Request dependencies shared by the routers: who is signed in, and the admin backend's token."""

import hmac
from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, Header, HTTPException, Response

from app.core import settings
from app.services import sessions

SESSION_COOKIE = "session"
# The browser sends the cookie only to the chat API, not to other services on the same domain
# (the inquiries backend, the admin console). Must match API_PREFIX in app/main.py.
SESSION_COOKIE_PATH = "/api/chat"


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.SESSION_DAYS * 24 * 60 * 60,
        path=SESSION_COOKIE_PATH,
        httponly=True,  # page JavaScript cannot read it
        secure=True,  # sent over HTTPS only (browsers allow localhost too)
        samesite="lax",  # not sent on cross-site POSTs
    )


def clear_session_cookie(response: Response) -> None:
    """Deletes the cookie. A browser matches it by name and path, so these must equal the above."""
    response.delete_cookie(
        SESSION_COOKIE,
        path=SESSION_COOKIE_PATH,
        httponly=True,
        secure=True,
        samesite="lax",
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


async def require_mod_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """For the /internal routes: the caller must send "Authorization: Bearer <MOD_API_TOKEN>"."""
    expected = f"Bearer {settings.MOD_API_TOKEN}"
    # compare_digest takes the same time however much of the guess is right,
    # so response times do not leak the token one character at a time.
    if authorization is None or not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="invalid token")