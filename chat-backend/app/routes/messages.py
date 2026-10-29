"""Course reviews, their replies, likes and reports over HTTP.

Reading is open to everyone; everything else needs a signed-in user."""

from typing import Annotated
from uuid import UUID

from app.routes.deps import current_user_id, http_errors, optional_user_id
from app.schemas.messages import MessageEdit, NewMessage
from app.services import messages
from app.services.courses import CourseNotFound
from app.services.users import UserBlocked
from fastapi import APIRouter, Depends

router = APIRouter(tags=["messages"])

_ERRORS = {
    CourseNotFound: (404, "course not found"),
    messages.MessageNotFound: (404, "message not found"),
    messages.ReplyTargetNotFound: (404, "replied message not found"),
    messages.InvalidContent: (422, f"content must be 1-{messages.MAX_LENGTH} characters"),
    messages.OffensiveContent: (422, "offensive content"),
    messages.AlreadyReported: (409, "already reported"),
    UserBlocked: (403, "user is blocked"),
}


def _public(row, viewer_id: UUID | None) -> dict:
    item = dict(row)
    # The author's internal id stays on the server; the page only needs "is it mine".
    # A deleted message comes without an author, and a guest has no id: neither is "mine".
    author_id = item.pop("user_id")
    item["is_mine"] = author_id is not None and author_id == viewer_id
    return item


@router.get("/courses/{course_id}/messages")
async def list_reviews(
    course_id: int,
    viewer_id: Annotated[UUID | None, Depends(optional_user_id)],
    sort: messages.Sort = "new",
    before: int | None = None,
):
    with http_errors(_ERRORS):
        rows = await messages.list_reviews(course_id, viewer_id, sort, before)
    items = [_public(row, viewer_id) for row in rows]
    # A full page may have more reviews behind it; pass this as ?before= to get them.
    next_before = items[-1]["id"] if len(items) == messages.PAGE_SIZE else None
    return {"messages": items, "next_before": next_before}


@router.get("/messages/{review_id}/replies")
async def list_replies(
    review_id: int,
    viewer_id: Annotated[UUID | None, Depends(optional_user_id)],
    after: int | None = None,
):
    with http_errors(_ERRORS):
        rows = await messages.list_replies(review_id, viewer_id, after)
    items = [_public(row, viewer_id) for row in rows]
    # A full page may have newer replies after it; pass this as ?after= to get them.
    next_after = items[-1]["id"] if len(items) == messages.PAGE_SIZE else None
    return {"replies": items, "next_after": next_after}


@router.get("/messages/{message_id}")
async def get_shared(
    message_id: int, viewer_id: Annotated[UUID | None, Depends(optional_user_id)]
):
    """For a shared link: the review to show on top, and the reply to point at if the
    link is to a reply (its discussion opens on the page)."""
    with http_errors(_ERRORS):
        row = await messages.get_shared(message_id, viewer_id)
    review = _public(row, viewer_id)
    course_id = review.pop("course_id")
    reply_id = message_id if message_id != review["id"] else None
    return {"course_id": course_id, "review": review, "reply_id": reply_id}


@router.post("/courses/{course_id}/messages", status_code=201)
async def post_message(
    course_id: int, body: NewMessage, user_id: Annotated[UUID, Depends(current_user_id)]
):
    with http_errors(_ERRORS):
        row = await messages.post(course_id, user_id, body.content, body.reply_to_id)
    return dict(row)


@router.put("/messages/{message_id}")
async def edit_message(
    message_id: int, body: MessageEdit, user_id: Annotated[UUID, Depends(current_user_id)]
):
    with http_errors(_ERRORS):
        row = await messages.edit(message_id, user_id, body.content)
    return dict(row)


@router.delete("/messages/{message_id}")
async def delete_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    with http_errors(_ERRORS):
        await messages.delete(message_id, user_id)
    return {"status": "ok"}


@router.put("/messages/{message_id}/like")
async def like_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    with http_errors(_ERRORS):
        await messages.like(message_id, user_id)
    return {"liked": True}


@router.delete("/messages/{message_id}/like")
async def unlike_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    await messages.unlike(message_id, user_id)
    return {"liked": False}


@router.post("/messages/{message_id}/report", status_code=201)
async def report_message(message_id: int, user_id: Annotated[UUID, Depends(current_user_id)]):
    with http_errors(_ERRORS):
        await messages.report(message_id, user_id)
    return {"status": "ok"}