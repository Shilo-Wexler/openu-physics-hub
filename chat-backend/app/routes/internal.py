"""Moderation routes for the admin backend. Every route needs the shared token (see deps.py)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.routes.deps import require_mod_token
from app.services import moderation
from app.services.messages import MessageNotFound

# The dependency on the router protects every route here, including ones added later.
router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_mod_token)]
)


def _check_ids(ids: list) -> None:
    if len(ids) > moderation.MAX_IDS:
        raise HTTPException(status_code=422, detail=f"at most {moderation.MAX_IDS} ids")


@router.get("/reported-messages")
async def reported_messages():
    return [dict(row) for row in await moderation.reported_messages()]


# ?ids=1&ids=2: any messages, deleted ones too, for the console's log.
@router.get("/messages")
async def messages(ids: Annotated[list[int], Query()]):
    _check_ids(ids)
    return [dict(row) for row in await moderation.messages_by_id(ids)]


@router.post("/messages/{message_id}/dismiss")
async def dismiss(message_id: int):
    return {"dismissed_reports": await moderation.dismiss(message_id)}


@router.post("/messages/{message_id}/reopen")
async def reopen(message_id: int):
    try:
        return {"reopened_reports": await moderation.reopen(message_id)}
    except MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    except moderation.NothingToUndo:
        raise HTTPException(status_code=409, detail="nothing to undo")


@router.post("/messages/{message_id}/remove")
async def remove(message_id: int):
    try:
        await moderation.remove(message_id)
    except MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    return {"status": "ok"}


@router.post("/messages/{message_id}/restore")
async def restore(message_id: int):
    try:
        return {"reopened_reports": await moderation.restore(message_id)}
    except MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    except moderation.NothingToUndo:
        raise HTTPException(status_code=409, detail="nothing to undo")


# ?ids=<uuid>&ids=<uuid>: nicknames for the console's log.
@router.get("/users")
async def users(ids: Annotated[list[UUID], Query()]):
    _check_ids(ids)
    return [dict(row) for row in await moderation.users_by_id(ids)]


@router.post("/users/{user_id}/block")
async def block(user_id: UUID):
    try:
        await moderation.block(user_id)
    except moderation.UserNotFound:
        raise HTTPException(status_code=404, detail="user not found")
    return {"status": "ok"}


@router.post("/users/{user_id}/unblock")
async def unblock(user_id: UUID):
    try:
        await moderation.unblock(user_id)
    except moderation.UserNotFound:
        raise HTTPException(status_code=404, detail="user not found")
    return {"status": "ok"}


@router.get("/blocked-users")
async def blocked_users():
    return [dict(row) for row in await moderation.blocked_users()]


@router.get("/users/{user_id}/removed-messages")
async def removed_messages(user_id: UUID):
    try:
        rows = await moderation.removed_messages(user_id)
    except moderation.UserNotFound:
        raise HTTPException(status_code=404, detail="user not found")
    return [dict(row) for row in rows]