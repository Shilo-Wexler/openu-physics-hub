"""Chat backend entry point: creates the app and plugs in the routers."""

import logging
from contextlib import asynccontextmanager

import asyncpg
from app.core import db, settings
from app.routes import auth, courses, health, internal, me, messages
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Public routes live under this prefix, the same path the Ingress forwards to this service.
API_PREFIX = "/api/chat"

# What the driver raises when Postgres cannot be reached: refused, timed out, name not found
# (all OSError), still starting up, or the connection dropped in the middle of a query.
_DB_UNAVAILABLE = (
    OSError,
    asyncpg.PostgresConnectionError,
    asyncpg.CannotConnectNowError,
    asyncpg.ConnectionDoesNotExistError,
)

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open_pool()
    yield
    await db.close_pool()


# The API docs map every route, /internal included, so they exist only in development.
app = FastAPI(
    title="Chat backend",
    lifespan=lifespan,
    docs_url="/docs" if settings.IS_DEV else None,
    redoc_url="/redoc" if settings.IS_DEV else None,
    openapi_url="/openapi.json" if settings.IS_DEV else None,
)


# Every error answers {"detail": "<short English text>"}, the same as the admin backend.

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
    return JSONResponse(status_code=422, content={"detail": f"{kind} {field}"})


@app.exception_handler(Exception)
async def server_error(_: Request, exc: Exception):
    """Unexpected failures: logged with the traceback (never the request body), answered with a
    plain detail. A DB that cannot be reached is a 503, so the site can say "try again later"."""
    if isinstance(exc, _DB_UNAVAILABLE):
        log.warning("database unavailable: %r", exc)
        return JSONResponse(status_code=503, content={"detail": "database unavailable"})
    log.error("unhandled error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "internal error"})


# Unprefixed on purpose: Kubernetes probes and the admin backend call the pod directly,
# and the Ingress only forwards API_PREFIX, so these are never reachable from outside.
app.include_router(health.router)
app.include_router(internal.router)

for router in (auth.router, me.router, courses.router, messages.router):
    app.include_router(router, prefix=API_PREFIX)