"""Sign-in and sign-out. A successful sign-in sets the session cookie."""

import hmac
import logging
from typing import Annotated
from urllib.parse import parse_qs
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, Request, Response

from app.routes.deps import clear_session_cookie, current_user_id, http_errors, set_session_cookie
from app.schemas.auth import GoogleSignIn
from app.services import google_auth, sessions, users

router = APIRouter(prefix="/auth", tags=["auth"])

log = logging.getLogger("uvicorn.error")

# The site's page the browser lands on after a redirect sign-in. It reads the flags below
# and takes the reader back to the page they signed in from.
SIGN_IN_DONE_PATH = "/auth/done"

_ERRORS = {
    google_auth.InvalidGoogleToken: (401, "invalid Google token"),
    google_auth.KeysUnavailable: (503, "sign-in keys unavailable"),
}


async def _sign_in(id_token: str, response: Response) -> tuple[UUID, bool, bool]:
    """Verify the Google token, find or create its user and set the session cookie.

    Signing in cancels a pending account deletion.
    Returns (user_id, is_new, restored), where restored means a deletion was cancelled.
    Raises google_auth.InvalidGoogleToken or google_auth.KeysUnavailable.
    """
    google_user_id = await google_auth.verify_id_token(id_token)
    user_id, is_new = await users.find_or_create("google", google_user_id)
    restored = not is_new and await users.cancel_deletion(user_id)
    set_session_cookie(response, await sessions.create(user_id))
    return user_id, is_new, restored


@router.post("/google")
async def sign_in_with_google(body: GoogleSignIn, response: Response):
    with http_errors(_ERRORS):
        user_id, is_new, restored = await _sign_in(body.id_token, response)
    # Same shape as GET /me plus the flags, so the browser needs no extra /me call after sign-in.
    user = await users.get(user_id)
    return {
        "user_id": user["id"],
        "nickname": user["nickname"],
        "avatar": user["avatar"],
        "is_new": is_new,
        "restored": restored,
    }


@router.post("/google/redirect")
async def sign_in_with_google_redirect(
    request: Request, g_csrf_token: Annotated[str | None, Cookie()] = None
):
    """Google's redirect mode: the whole page goes to Google, which then posts a form here.

    No popup window, which some phone browsers (Chrome on iPhone) leave white. The answer is
    always a redirect back to the site, so the reader never sees a bare error from here.
    """
    failed = Response(status_code=303, headers={"location": f"{SIGN_IN_DONE_PATH}?error=1"})

    # A plain form (credential, g_csrf_token). Parsed by hand: one small body is not worth
    # adding python-multipart as a dependency.
    form = parse_qs((await request.body()).decode())
    credential = form.get("credential", [""])[0]
    form_csrf = form.get("g_csrf_token", [""])[0]

    # Google's double-submit check: Google sets the same random value as a cookie on our
    # site and in the form. Another site can make a browser post a form here, but cannot
    # read or set our cookies, so it cannot make the two match.
    # compare_digest takes the same time however much of a guess is right.
    if not (
        credential
        and g_csrf_token
        and form_csrf
        and hmac.compare_digest(g_csrf_token.encode(), form_csrf.encode())
    ):
        return failed

    # 303: the browser follows with a GET, not by posting the form again.
    response = Response(status_code=303)
    try:
        _, is_new, restored = await _sign_in(credential, response)
    except google_auth.InvalidGoogleToken:
        return failed
    except google_auth.KeysUnavailable:
        log.warning("Google signing keys unavailable")
        return failed
    if is_new:
        location = f"{SIGN_IN_DONE_PATH}?new=1"
    elif restored:
        location = f"{SIGN_IN_DONE_PATH}?restored=1"
    else:
        location = SIGN_IN_DONE_PATH
    response.headers["location"] = location
    return response


@router.post("/logout")
async def logout(response: Response, session: Annotated[str | None, Cookie()] = None):
    if session:
        await sessions.delete(session)
    clear_session_cookie(response)
    return {"status": "ok"}


@router.post("/logout-all")
async def logout_all(response: Response, user_id: Annotated[UUID, Depends(current_user_id)]):
    await sessions.delete_all(user_id)
    clear_session_cookie(response)
    return {"status": "ok"}
