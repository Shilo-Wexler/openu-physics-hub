"""STUDENT-SIDE: the student submission, POST /api/requests. Students never read, edit or delete.

Open decision: the friend owns the student UI. Either his frontend calls this endpoint
(contract: docs/requests-api.md), or his backend takes submission over and this file goes away.
Everything else that exists only for this path is marked STUDENT-SIDE.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection, errors

from ..auth import verify_google_token
from ..config import DUPLICATE_WINDOW_MINUTES, MAX_REQUESTS_PER_HOUR
from ..db import get_conn
from ..schemas import NewRequest

router = APIRouter(prefix="/api", tags=["public"])


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_request(payload: NewRequest, conn: Connection = Depends(get_conn)):
    user = verify_google_token(payload.id_token)
    if payload.email != user.email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "email does not match token")

    recent = conn.execute(
        """
        select
          count(*)                                             as last_hour,
          count(*) filter (where body = %(body)s
                           and created_at > now() - make_interval(mins => %(dup)s::int)) as duplicates
        from requests
        where email = %(email)s and created_at > now() - interval '1 hour'
        """,
        {"email": user.email, "body": payload.body, "dup": DUPLICATE_WINDOW_MINUTES},
    ).fetchone()
    if recent["duplicates"] > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "duplicate request")
    if recent["last_hour"] >= MAX_REQUESTS_PER_HOUR:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many requests, try again later")

    try:
        conn.execute(
            """
            insert into requests (full_name, email, course_name, body)
            values (%(full_name)s, %(email)s, %(course_name)s, %(body)s)
            """,
            {
                "full_name": payload.full_name,
                "email": user.email,
                "course_name": payload.course_name,
                "body": payload.body,
            },
        )
    except errors.ForeignKeyViolation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "unknown course")
    except errors.CheckViolation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid field value")
    except errors.RaiseException:
        # Raised by the blocked-sender trigger. Same generic answer, no hint that the sender is blocked.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "request not accepted")

    return {"ok": True}
