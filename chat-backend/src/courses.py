"""Courses and their ratings. Averages are computed by Postgres on read (see ratings_course_idx)."""

from uuid import UUID

import asyncpg

import db

# Averages and count per course. Left join keeps courses that have no ratings yet (avg is null).
_COURSES_WITH_RATINGS = """
    select c.id, c.name,
           avg(r.difficulty)::float8     as avg_difficulty,
           avg(r.recommendation)::float8 as avg_recommendation,
           count(r.user_id)              as ratings_count
      from courses c
      left join ratings r on r.course_id = c.id
"""


class CourseNotFound(Exception):
    pass


async def list_all() -> list[asyncpg.Record]:
    return await db.pool.fetch(_COURSES_WITH_RATINGS + " group by c.id order by c.id")


async def get(course_id: int) -> asyncpg.Record | None:
    return await db.pool.fetchrow(
        _COURSES_WITH_RATINGS + " where c.id = $1 group by c.id", course_id
    )


async def get_user_rating(course_id: int, user_id: UUID) -> asyncpg.Record | None:
    return await db.pool.fetchrow(
        "select difficulty, recommendation from ratings where course_id = $1 and user_id = $2",
        course_id, user_id,
    )


async def rate(course_id: int, user_id: UUID, difficulty: int, recommendation: int) -> None:
    """Create or replace the user's rating of a course (one per user per course)."""
    try:
        await db.pool.execute(
            """
            insert into ratings (user_id, course_id, difficulty, recommendation)
            values ($1, $2, $3, $4)
            on conflict (user_id, course_id)
            do update set difficulty = excluded.difficulty,
                          recommendation = excluded.recommendation
            """,
            user_id, course_id, difficulty, recommendation,
        )
    except asyncpg.ForeignKeyViolationError:
        raise CourseNotFound()
    except asyncpg.RaiseError as exc:
        # Raised by the reject_blocked_user trigger.
        raise PermissionError(str(exc)) from exc