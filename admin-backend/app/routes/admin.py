"""Admin side: queues, lists, read/unread, close, delete, stats and blocking. All endpoints require an admin."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from ..auth import GoogleUser, require_admin, require_full_admin
from ..config import MAX_PAGE_SIZE
from ..db import get_conn
from ..schemas import AdminRoles, BlockEmail, NewAdmin

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

# Columns for list views: a short preview instead of the full body.
LIST_COLUMNS = """
  id, full_name, email, course_name, status, is_opened, created_at,
  left(body, 200) as preview
"""

# Sort options the client may pick from. Never put client text into ORDER BY.
SORTS = {
    "newest": "created_at desc, id desc",
    "oldest": "created_at asc, id asc",
}


# ---------- Who am I ----------

@router.get("/me")
def me(user: GoogleUser = Depends(require_admin)):
    """200 with the admin's email; 401/403 come from require_admin. The frontend uses it as the admin check."""
    return {"email": user.email, "name": user.name, "roles": user.roles}


# ---------- Counters and lists ----------

@router.get("/summary")
def summary(conn: Connection = Depends(get_conn)):
    return conn.execute(
        """
        select
          count(*) filter (where not is_opened)                 as unread,
          count(*) filter (where is_opened and status = 'new')  as in_progress,
          count(*) filter (where status = 'closed')             as closed,
          count(*)                                              as total
        from requests
        """
    ).fetchone()


@router.get("/requests/unread")
def unread_requests(
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    conn: Connection = Depends(get_conn),
):
    """Only requests no admin has read yet, oldest first (the work queue)."""
    return conn.execute(
        f"select {LIST_COLUMNS} from requests where not is_opened "
        "order by created_at asc, id asc limit %(limit)s",
        {"limit": limit},
    ).fetchall()


@router.get("/requests/read")
def read_requests(
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    conn: Connection = Depends(get_conn),
):
    """Only requests an admin has already read, newest first."""
    return conn.execute(
        f"select {LIST_COLUMNS} from requests where is_opened "
        "order by created_at desc, id desc limit %(limit)s",
        {"limit": limit},
    ).fetchall()


@router.get("/requests")
def list_requests(
    course_name: str | None = None,
    status_: Literal["new", "closed"] | None = Query(None, alias="status"),
    is_opened: bool | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    email: str | None = None,
    sort: Literal["newest", "oldest"] = "newest",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
    conn: Connection = Depends(get_conn),
):
    """All requests with optional filters. date_to is exclusive."""
    # Fixed SQL fragments only; every value goes through params.
    where, params = [], {}
    if course_name is not None:
        where.append("course_name = %(course_name)s")
        params["course_name"] = course_name
    if status_ is not None:
        where.append("status = %(status)s")
        params["status"] = status_
    if is_opened is not None:
        where.append("is_opened = %(is_opened)s")
        params["is_opened"] = is_opened
    if date_from is not None:
        where.append("created_at >= %(date_from)s")
        params["date_from"] = date_from
    if date_to is not None:
        where.append("created_at < %(date_to)s")
        params["date_to"] = date_to
    if email is not None:
        where.append("email = %(email)s")
        params["email"] = email.strip().lower()
    where_sql = ("where " + " and ".join(where)) if where else ""

    total = conn.execute(f"select count(*) as n from requests {where_sql}", params).fetchone()["n"]
    items = conn.execute(
        f"select {LIST_COLUMNS} from requests {where_sql} "
        f"order by {SORTS[sort]} limit %(limit)s offset %(offset)s",
        {**params, "limit": page_size, "offset": (page - 1) * page_size},
    ).fetchall()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/requests/{request_id}")
def get_request(request_id: int, conn: Connection = Depends(get_conn)):
    row = conn.execute(
        "select id, full_name, email, course_name, body, status, is_opened, created_at "
        "from requests where id = %s",
        (request_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    return row


# ---------- State changes ----------

@router.post("/requests/{request_id}/read")
def mark_read(request_id: int, conn: Connection = Depends(get_conn)):
    row = conn.execute(
        "update requests set is_opened = true where id = %s returning id, status, is_opened",
        (request_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    return row


@router.post("/requests/{request_id}/unread")
def mark_unread(request_id: int, conn: Connection = Depends(get_conn)):
    """Back to unread. Not allowed for closed requests (a closed request must stay read)."""
    row = conn.execute(
        "update requests set is_opened = false where id = %s and status = 'new' "
        "returning id, status, is_opened",
        (request_id,),
    ).fetchone()
    if row is not None:
        return row
    exists = conn.execute("select 1 from requests where id = %s", (request_id,)).fetchone()
    if exists is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    raise HTTPException(status.HTTP_409_CONFLICT, "a closed request cannot be marked unread")


@router.post("/requests/{request_id}/reopen")
def reopen_request(request_id: int, conn: Connection = Depends(get_conn)):
    """Back to handling: a closed request becomes new again and stays read ("in progress")."""
    row = conn.execute(
        "update requests set status = 'new' where id = %s returning id, status, is_opened",
        (request_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    return row


@router.post("/requests/{request_id}/close")
def close_request(request_id: int, conn: Connection = Depends(get_conn)):
    row = conn.execute(
        "update requests set status = 'closed' where id = %s and is_opened "
        "returning id, status, is_opened",
        (request_id,),
    ).fetchone()
    if row is not None:
        return row
    exists = conn.execute("select 1 from requests where id = %s", (request_id,)).fetchone()
    if exists is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    raise HTTPException(status.HTTP_409_CONFLICT, "request must be read before closing")


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(request_id: int, conn: Connection = Depends(get_conn)):
    """Permanently deletes a request. It also disappears from stats and spam monitoring."""
    row = conn.execute("delete from requests where id = %s returning id", (request_id,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")


# ---------- Stats ----------

@router.get("/stats/by-course")
def stats_by_course(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    conn: Connection = Depends(get_conn),
):
    """Requests per course, including courses with zero. Inactive courses appear only if they have requests."""
    return conn.execute(
        """
        select c.name as course_name, c.course_number,
               count(r.id)                                as total,
               count(r.id) filter (where not r.is_opened) as unread
        from courses c
        left join requests r
          on r.course_name = c.name
         and (%(from)s::timestamptz is null or r.created_at >= %(from)s::timestamptz)
         and (%(to)s::timestamptz   is null or r.created_at <  %(to)s::timestamptz)
        group by c.name, c.course_number, c.is_active
        having c.is_active or count(r.id) > 0
        order by total desc, c.name
        """,
        {"from": date_from, "to": date_to},
    ).fetchall()


@router.get("/stats/weekly")
def stats_weekly(
    weeks: int = Query(12, ge=1, le=104),
    course_name: str | None = None,
    conn: Connection = Depends(get_conn),
):
    """Requests per week for the last N weeks (weeks with zero included), optionally for one course."""
    return conn.execute(
        """
        with w as (
          select generate_series(
                   date_trunc('week', now()) - make_interval(weeks => %(weeks)s::int - 1),
                   date_trunc('week', now()),
                   interval '1 week') as week
        )
        select w.week, count(r.id) as total
        from w
        left join requests r
          on r.created_at >= w.week
         and r.created_at <  w.week + interval '1 week'
         and (%(course)s::text is null or r.course_name = %(course)s::text)
        group by w.week
        order by w.week
        """,
        {"weeks": weeks, "course": course_name},
    ).fetchall()


@router.get("/stats/top-senders")
def stats_top_senders(
    days: int = Query(7, ge=1, le=365),
    limit: int = Query(10, ge=1, le=MAX_PAGE_SIZE),
    conn: Connection = Depends(get_conn),
):
    """Emails with the most requests in the last N days, for spam monitoring."""
    return conn.execute(
        """
        select r.email,
               count(*)          as total,
               max(r.created_at) as last_at,
               exists (select 1 from blocked_emails b where b.email = r.email) as is_blocked
        from requests r
        where r.created_at > now() - make_interval(days => %(days)s::int)
        group by r.email
        order by total desc, last_at desc
        limit %(limit)s
        """,
        {"days": days, "limit": limit},
    ).fetchall()


# ---------- Blocking and courses ----------

@router.get("/blocked")
def list_blocked(conn: Connection = Depends(get_conn)):
    return conn.execute(
        "select email, reason, blocked_at from blocked_emails order by blocked_at desc"
    ).fetchall()


@router.post("/blocked", status_code=status.HTTP_201_CREATED)
def block_email(payload: BlockEmail, conn: Connection = Depends(get_conn)):
    return conn.execute(
        """
        insert into blocked_emails (email, reason) values (%(email)s, %(reason)s)
        on conflict (email) do update set reason = excluded.reason
        returning email, reason, blocked_at
        """,
        {"email": payload.email, "reason": payload.reason},
    ).fetchone()


@router.delete("/blocked/{email}", status_code=status.HTTP_204_NO_CONTENT)
def unblock_email(email: str, conn: Connection = Depends(get_conn)):
    row = conn.execute(
        "delete from blocked_emails where email = %s returning email", (email.strip().lower(),)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "email is not blocked")


@router.get("/courses")
def list_courses(conn: Connection = Depends(get_conn)):
    return conn.execute(
        "select name, course_number from courses where is_active order by course_number nulls first"
    ).fetchall()


# ---------- Admins: every admin can see the list; only the "admin" role may change it ----------

ADMIN_COLUMNS = "email, roles, added_by, created_at"


@router.get("/admins")
def list_admins(conn: Connection = Depends(get_conn)):
    return conn.execute(f"select {ADMIN_COLUMNS} from admins order by created_at, email").fetchall()


@router.post("/admins", status_code=status.HTTP_201_CREATED)
def add_admin(payload: NewAdmin, user: GoogleUser = Depends(require_full_admin), conn: Connection = Depends(get_conn)):
    """Takes effect at once: access is checked against this table on every request."""
    row = conn.execute(
        f"insert into admins (email, roles, added_by) values (%s, %s, %s) on conflict (email) do nothing "
        f"returning {ADMIN_COLUMNS}",
        (payload.email, payload.roles, user.email),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "already an admin")
    return row


@router.put("/admins/{email}/roles")
def set_admin_roles(
    email: str, payload: AdminRoles, user: GoogleUser = Depends(require_full_admin), conn: Connection = Depends(get_conn)
):
    """Change another admin's level. Not your own, so there is always someone left who can manage admins."""
    target = email.strip().lower()
    if target == user.email:
        raise HTTPException(status.HTTP_409_CONFLICT, "you cannot change your own roles")
    row = conn.execute(
        f"update admins set roles = %s where email = %s returning {ADMIN_COLUMNS}", (payload.roles, target)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not an admin")
    return row


@router.delete("/admins/{email}", status_code=status.HTTP_204_NO_CONTENT)
def remove_admin(email: str, user: GoogleUser = Depends(require_full_admin), conn: Connection = Depends(get_conn)):
    """Takes effect at once. Not yourself, so there is always someone left who can manage admins."""
    target = email.strip().lower()
    if target == user.email:
        raise HTTPException(status.HTTP_409_CONFLICT, "you cannot remove yourself")
    row = conn.execute("delete from admins where email = %s returning email", (target,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not an admin")
