"""Course messages, likes and reports over HTTP.

Reading is open to everyone; everything else needs a signed-in user."""


from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import messages
from courses import CourseNotFound
from deps import current_user_id, optional_user_id

router = APIRouter(tags=["messages"])


def _content_error(exc: Exception) -> HTTPException:
    """Maps the content checks shared by posting and editing to HTTP errors."""
    if isinstance(exc, messages.OffensiveContent):
        return HTTPException(status_code=422, detail="offensive content")
    if isinstance(exc, messages.InvalidContent):
        return HTTPException(
            status_code=422, detail=f"content must be 1-{messages.MAX_LENGTH} characters"
        )
    return HTTPException(status_code=403, detail="user is blocked")


@router.get("/courses/{course_id}/messages")
async def list_messages(
    course_id: int,
    viewer_id: Annotated[UUID | None, Depends(optional_user_id)],
    before: int | None = None,
):
    try:
        rows = await messages.list_for_course(course_id, viewer_id, before)
    except CourseNotFound:
        raise HTTPException(status_code=404, detail="course not found")
    items = []
    for row in rows:
        item = dict(row)
        # The author's internal id stays on the server; the page only needs "is it mine".
        item["is_mine"] = item.pop("user_id") == viewer_id
        items.append(item)
    # A full page may have older messages behind it; pass this as ?before= to get them.
    next_before = items[-1]["id"] if len(items) == messages.PAGE_SIZE else None
    return {"messages": items, "next_before": next_before}


class NewMessage(BaseModel):
    content: str
    reply_to_id: int | None = None


@router.post("/courses/{course_id}/messages", status_code=201)
async def post_message(
    course_id: int, body: NewMessage, user_id: Annotated[UUID, Depends(current_user_id)]
):
    try:
        row = await messages.post(course_id, user_id, body.content, body.reply_to_id)
    except CourseNotFound:
        raise HTTPException(status_code=404, detail="course not found")
    except messages.ReplyTargetNotFound:
        raise HTTPException(status_code=404, detail="replied message not found")
    except (messages.InvalidContent, messages.OffensiveContent, PermissionError) as exc:
        raise _content_error(exc)
    return dict(row)


class MessageEdit(BaseModel):
    content: str


@router.put("/messages/{message_id}")
async def edit_message(
    message_id: int, body: MessageEdit, user_id: Annotated[UUID, Depends(current_user_id)]
):
    try:
        row = await messages.edit(message_id, user_id, body.content)
    except messages.MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    except (messages.InvalidContent, messages.OffensiveContent, PermissionError) as exc:
        raise _content_error(exc)
    return dict(row)


@router.delete("/messages/{message_id}")
async def delete_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    try:
        await messages.delete(message_id, user_id)
    except messages.MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    return {"status": "ok"}


@router.put("/messages/{message_id}/like")
async def like_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    try:
        await messages.like(message_id, user_id)
    except messages.MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="user is blocked")
    return {"liked": True}


@router.delete("/messages/{message_id}/like")
async def unlike_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    await messages.unlike(message_id, user_id)
    return {"liked": False}


@router.post("/messages/{message_id}/report", status_code=201)
async def report_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    try:
        await messages.report(message_id, user_id)
    except messages.MessageNotFound:
        raise HTTPException(status_code=404, detail="message not found")
    except messages.AlreadyReported:
        raise HTTPException(status_code=409, detail="already reported")
    except PermissionError:
        raise HTTPException(status_code=403, detail="user is blocked")
    return {"status": "ok"}