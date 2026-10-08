"""Chat backend entry point: creates the app and plugs in the routers."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

import db
from routes import auth, courses, health, me, messages

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open_pool()
    yield
    await db.close_pool()


app = FastAPI(title="Chat backend", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(courses.router)
app.include_router(messages.router)
