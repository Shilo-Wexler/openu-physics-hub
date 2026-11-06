"""Moderation and stats routes for the admin backend. Every route needs the shared token (see deps.py)."""

from typing import Annotated
from uuid import UUID

from app.routes.deps import http_errors, require_mod_token
from app.services import moderation, stats
from app.services.messages import MessageNotFound
from fastapi import APIRouter, Depends, Query

# The dependency on the router protects every route here, including ones added later.
router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_mod_token)]
)

# Longest period a stats request may ask for. Longer is "all time" anyway (no days),
# and the bound keeps now() - days (and twice that, for the previous period)
# inside the range Postgres dates can hold.
MAX_STATS_DAYS = 3650

_ERRORS = {
    MessageNotFound: (404, "message not found"),
    moderation.UserNotFound: (404, "user not found"),
    moderation.NothingToUndo: (409, "nothing to undo"),
}


@router.get("/reported-messages")
async def reported_messages():
    return [dict(row) for row in await moderation.reported_messages()]


# ?ids=1&ids=2: any messages, deleted ones too, for the console's log.
# More than MAX_IDS ids is a 422 ("invalid ids").
@router.get("/messages")
async def messages(ids: Annotated[list[int], Query(max_length=moderation.MAX_IDS)]):
    return [dict(row) for row in await moderation.messages_by_id(ids)]


@router.post("/messages/{message_id}/dismiss")
async def dismiss(message_id: int):
    return {"dismissed_reports": await moderation.dismiss(message_id)}


@router.post("/messages/{message_id}/reopen")
async def reopen(message_id: int):
    with http_errors(_ERRORS):
        return {"reopened_reports": await moderation.reopen(message_id)}


@router.post("/messages/{message_id}/remove")
async def remove(message_id: int):
    with http_errors(_ERRORS):
        await moderation.remove(message_id)
    return {"status": "ok"}


@router.post("/messages/{message_id}/restore")
async def restore(message_id: int):
    with http_errors(_ERRORS):
        return {"reopened_reports": await moderation.restore(message_id)}


# ?ids=<uuid>&ids=<uuid>: nicknames for the console's log.
@router.get("/users")
async def users(ids: Annotated[list[UUID], Query(max_length=moderation.MAX_IDS)]):
    return [dict(row) for row in await moderation.users_by_id(ids)]


@router.post("/users/{user_id}/block")
async def block(user_id: UUID):
    with http_errors(_ERRORS):
        await moderation.block(user_id)
    return {"status": "ok"}


@router.post("/users/{user_id}/unblock")
async def unblock(user_id: UUID):
    with http_errors(_ERRORS):
        await moderation.unblock(user_id)
    return {"status": "ok"}


@router.get("/blocked-users")
async def blocked_users():
    return [dict(row) for row in await moderation.blocked_users()]


@router.get("/users/{user_id}/removed-messages")
async def removed_messages(user_id: UUID):
    with http_errors(_ERRORS):
        rows = await moderation.removed_messages(user_id)
    return [dict(row) for row in rows]


# ?limit=5&days=30: the courses with the most messages in the last 30 days.
# Without days: all time.
@router.get("/stats/courses")
async def stats_courses(
    limit: Annotated[int, Query(ge=1, le=stats.MAX_LIMIT)],
    days: Annotated[int | None, Query(ge=1, le=MAX_STATS_DAYS)] = None,
):
    return [dict(row) for row in await stats.active_courses(limit, days)]


# ?days=30: users, posts and replies in the last 30 days and the 30 days before them,
# plus accounts waiting to be deleted. Without days: all time (no "new"/"previous" numbers).
@router.get("/stats/summary")
async def stats_summary(
    days: Annotated[int | None, Query(ge=1, le=MAX_STATS_DAYS)] = None,
):
    return dict(await stats.summary(days))