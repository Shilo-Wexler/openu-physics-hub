"""Chat backend entry point."""

from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import db
import google_auth
import sessions
import settings
import users

SESSION_COOKIE = "session"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open_pool()
    yield
    await db.close_pool()


app = FastAPI(title="Chat backend", lifespan=lifespan)


@app.get("/health/live")
async def live():
    # Process is up and answering. Never touches the DB.
    return {"status": "ok"}


@app.get("/health/ready")
async def ready():
    # DB answers and at least one course is loaded. No fixed course count:
    # exists() stops at the first row, so it stays cheap as the table grows.
    try:
        async with db.pool.acquire(timeout=settings.READY_TIMEOUT) as conn:
            has_courses = await conn.fetchval(
                "select exists (select 1 from courses)", timeout=settings.READY_TIMEOUT
            )
    except Exception as exc:
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": type(exc).__name__}
        )
    if not has_courses:
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": "no courses loaded"}
        )
    return {"status": "ok"}


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.SESSION_DAYS * 24 * 60 * 60,
        httponly=True,  # page JavaScript cannot read it
        secure=True,  # sent over HTTPS only (browsers allow localhost too)
        samesite="lax",  # not sent on cross-site POSTs
    )


async def current_user_id(
    response: Response, session: Annotated[str | None, Cookie()] = None
) -> UUID:
    """Dependency for routes that need a signed-in user."""
    user_id = await sessions.get_user_id(session) if session else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="not signed in")
    # Re-send the cookie so its browser expiry slides along with the session.
    _set_session_cookie(response, session)
    return user_id


class GoogleSignIn(BaseModel):
    id_token: str


@app.post("/auth/google")
async def sign_in_with_google(body: GoogleSignIn, response: Response):
    try:
        google_user_id = await google_auth.verify_id_token(body.id_token)
    except google_auth.InvalidGoogleToken:
        raise HTTPException(status_code=401, detail="invalid Google token")
    user_id = await users.find_or_create("google", google_user_id)
    _set_session_cookie(response, await sessions.create(user_id))
    return {"user_id": user_id}


@app.post("/auth/logout")
async def logout(response: Response, session: Annotated[str | None, Cookie()] = None):
    if session:
        await sessions.delete(session)
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}


@app.post("/auth/logout-all")
async def logout_all(response: Response, user_id: Annotated[UUID, Depends(current_user_id)]):
    await sessions.delete_all(user_id)
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}


@app.get("/me")
async def me(user_id: Annotated[UUID, Depends(current_user_id)]):
    return {"user_id": user_id}