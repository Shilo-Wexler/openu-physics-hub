"""Sign-in and sign-out. A successful sign-in sets the session cookie."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel

from app.routes.deps import clear_session_cookie, current_user_id, set_session_cookie
from app.services import google_auth, sessions, users

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleSignIn(BaseModel):
    id_token: str


@router.post("/google")
async def sign_in_with_google(body: GoogleSignIn, response: Response):
    try:
        google_user_id = await google_auth.verify_id_token(body.id_token)
    except google_auth.InvalidGoogleToken:
        raise HTTPException(status_code=401, detail="invalid Google token")
    user_id, is_new = await users.find_or_create("google", google_user_id)
    set_session_cookie(response, await sessions.create(user_id))
    # Same shape as GET /me plus is_new, so the browser needs no extra /me call after sign-in.
    user = await users.get(user_id)
    return {
        "user_id": user["id"],
        "nickname": user["nickname"],
        "avatar": user["avatar"],
        "is_new": is_new,
    }


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