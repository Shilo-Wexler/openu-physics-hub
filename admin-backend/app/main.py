"""Admin backend entry point. Run from admin-backend:  uvicorn app.main:app --reload"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import ALLOWED_ORIGINS, DEV_AUTH_EMAIL
from .db import pool
from .routes import admin, announcements, chat, inquiries, public


@asynccontextmanager
async def lifespan(_: FastAPI):
    if DEV_AUTH_EMAIL:
        logging.getLogger("uvicorn.error").warning(
            "DEV_AUTH_EMAIL is set: Google sign-in is bypassed. Never use this in production."
        )
    pool.open()
    yield
    pool.close()


class UTF8JSONResponse(JSONResponse):
    # States the charset explicitly, so clients that don't assume UTF-8
    # (e.g. Windows PowerShell 5.1) show Hebrew correctly.
    media_type = "application/json; charset=utf-8"


app = FastAPI(
    title="Physics committee requests - admin backend",
    lifespan=lifespan,
    default_response_class=UTF8JSONResponse,
)

log = logging.getLogger("uvicorn.error")


# Every error answers {"detail": "<short English text>"} (agreed with the chat side), so clients can map it.

@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    """One stable detail instead of FastAPI's list: "invalid <field>" or "missing <field>"."""
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = list(first.get("loc", ()))
    if loc and loc[0] in ("body", "query", "path", "header", "cookie"):
        loc = loc[1:]  # where it came from; a field may itself be called "body"
    names = [p for p in loc if isinstance(p, str)]
    field = names[-1] if names else "request"
    kind = "missing" if first.get("type") == "missing" else "invalid"
    return UTF8JSONResponse(status_code=422, content={"detail": f"{kind} {field}"})


@app.exception_handler(Exception)
async def server_error(_: Request, exc: Exception):
    """Unexpected failures: logged with the traceback (never the request body), answered with a plain detail."""
    log.error("unhandled error", exc_info=exc)
    return UTF8JSONResponse(status_code=500, content={"detail": "internal error"})


# PUT is for PUT /api/admin/admins/{email}/roles (replace an admin's roles).
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(public.router)
app.include_router(inquiries.router)
app.include_router(inquiries.admin_router)
app.include_router(admin.router)
app.include_router(chat.router)
app.include_router(announcements.router)
app.include_router(announcements.admin_router)


@app.get("/health")
def health():
    return {"ok": True}
