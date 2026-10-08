"""Courses and ratings. Browsing is open to everyone; rating needs a signed-in user."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.routes.deps import current_user_id, optional_user_id
from app.services import courses

router = APIRouter(prefix="/courses", tags=["courses"])


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


class Rating(BaseModel):
    difficulty: int = Field(ge=1, le=5)
    recommendation: int = Field(ge=1, le=5)


@router.put("/{course_id}/rating")
async def rate_course(
    course_id: int, body: Rating, user_id: Annotated[UUID, Depends(current_user_id)]
):
    try:
        await courses.rate(course_id, user_id, body.difficulty, body.recommendation)
    except courses.CourseNotFound:
        raise HTTPException(status_code=404, detail="course not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="user is blocked")
    return body