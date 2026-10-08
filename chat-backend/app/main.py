"""Chat backend entry point: creates the app and plugs in the routers."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core import db
from app.routes import auth, courses, health, internal, me, messages

# Public routes live under this prefix, the same path the Ingress forwards to this service.
API_PREFIX = "/api/chat"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open_pool()
    yield
    await db.close_pool()


app = FastAPI(title="Chat backend", lifespan=lifespan)

# Unprefixed on purpose: Kubernetes probes and the admin backend call the pod directly,
# and the Ingress only forwards API_PREFIX, so these are never reachable from outside.
app.include_router(health.router)
app.include_router(internal.router)

for router in (auth.router, me.router, courses.router, messages.router):
    app.include_router(router, prefix=API_PREFIX)