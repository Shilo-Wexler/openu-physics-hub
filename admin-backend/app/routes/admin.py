"""Console basics: who am I, the course list, and the admins table. All endpoints require an admin."""

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from ..auth import GoogleUser, require_admin, require_full_admin
from ..db import get_conn
from ..schemas import AdminRoles, NewAdmin

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------- Who am I ----------

@router.get("/me")
def me(user: GoogleUser = Depends(require_admin)):
    """200 with the admin's email; 401/403 come from require_admin. The frontend uses it as the admin check."""
    return {"email": user.email, "name": user.name, "roles": user.roles}


# ---------- Courses ----------

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
