"""Courses and ratings. Browsing is open to everyone; rating needs a signed-in user."""

from typing import Annotated
from uuid import UUID

from app.routes.deps import current_user_id, http_errors, optional_user_id
from app.schemas.courses import Rating
from app.services import courses
from app.services.users import UserBlocked
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/courses", tags=["courses"])

_ERRORS = {
    courses.CourseNotFound: (404, "course not found"),
    UserBlocked: (403, "user is blocked"),
}


@router.get("")
async def list_courses():
    return [dict(row) for row in await courses.list_all()]


@router.get("/{course_id}")
async def get_course(
    course_id: int, user_id: Annotated[UUID | None, Depends(optional_user_id)]
):
    course = await courses.get(course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="course not found")
    # A signed-in visitor also gets their own rating; a guest gets null.
    my_rating = await courses.get_user_rating(course_id, user_id) if user_id else None
    return {**course, "my_rating": dict(my_rating) if my_rating else None}


@router.put("/{course_id}/rating")
async def rate_course(
    course_id: int, body: Rating, user_id: Annotated[UUID, Depends(current_user_id)]
):
    with http_errors(_ERRORS):
        await courses.rate(course_id, user_id, body.difficulty, body.recommendation)
    return body