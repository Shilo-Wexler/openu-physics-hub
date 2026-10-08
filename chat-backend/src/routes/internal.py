"""Moderation routes for the admin backend. Every route needs the shared token (see deps.py)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

import moderation
from deps import require_mod_token
from messages import MessageNotFound

# The dependency on the router protects every route here, including ones added later.
router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_mod_token)]
)


@router.get("/reported-messages")
async def reported_messages():
    return [dict(row) for row in await moderation.reported_messages()]


@router.post("/messages/{message_id}/dismiss")
async def dismiss(message_id: int):
    return {"dismissed_reports": await moderation.dismiss(message_id)}


@router.post("/messages/{message_id}/remove")
async def remove(message_id: int):
    try:
        await moderation.remove(message_id)
    except MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    return {"status": "ok"}


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