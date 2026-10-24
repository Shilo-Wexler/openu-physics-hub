"""Console basics: who am I, the course list, and the admins table. All endpoints require an admin."""

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from ..auth import GoogleUser, require_admin, require_manager
from ..db import get_conn
from ..schemas import AdminNameIn, AdminRole, NewAdmin

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------- Who am I ----------

@router.get("/me")
def me(user: GoogleUser = Depends(require_admin)):
    """200 with the admin's email, name and level; 401/403 come from require_admin.
    The frontend uses it as the admin check."""
    return {"email": user.email, "name": user.name, "role": user.role}


# ---------- Courses ----------

@router.get("/courses")
def list_courses(conn: Connection = Depends(get_conn)):
    return conn.execute(
        "select name, course_number from courses where is_active order by course_number nulls first"
    ).fetchall()


# ---------- Admins: every level sees them; admins manage them; only a super admin touches a super admin ----------

ADMIN_COLUMNS = "email, name, role, added_by, created_at"


def _guard_super_admin(user: GoogleUser, *roles: str) -> None:
    """403 when an admin (not a super admin) tries to give or touch the super admin level."""
    if "super_admin" in roles and not user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "requires a super admin")


def _target(conn: Connection, user: GoogleUser, email: str) -> dict:
    """The admin row being changed or removed, locked until the change is saved. Never your own row,
    so a super admin always remains: only a super admin can change or remove another one."""
    target = email.strip().lower()
    if target == user.email:
        raise HTTPException(status.HTTP_409_CONFLICT, "you cannot change or remove yourself")
    row = conn.execute("select email, role from admins where email = %s for update", (target,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not an admin")
    _guard_super_admin(user, row["role"])
    return row


@router.get("/admins")
def list_admins(conn: Connection = Depends(get_conn)):
    """Every level may see the list; only admins and super admins change it."""
    return conn.execute(f"select {ADMIN_COLUMNS} from admins order by created_at, email").fetchall()


@router.post("/admins", status_code=status.HTTP_201_CREATED)
def add_admin(payload: NewAdmin, user: GoogleUser = Depends(require_manager), conn: Connection = Depends(get_conn)):
    """Takes effect at once: access is checked against this table on every request."""
    _guard_super_admin(user, payload.role)
    row = conn.execute(
        f"insert into admins (email, name, role, added_by) values (%s, %s, %s, %s) on conflict (email) do nothing "
        f"returning {ADMIN_COLUMNS}",
        (payload.email, payload.name, payload.role, user.email),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "already an admin")
    return row


@router.put("/admins/{email}/role")
def set_admin_role(
    email: str, payload: AdminRole, user: GoogleUser = Depends(require_manager), conn: Connection = Depends(get_conn)
):
    """Change another admin's level. Takes effect on their next request."""
    target = _target(conn, user, email)
    _guard_super_admin(user, payload.role)
    return conn.execute(
        f"update admins set role = %s where email = %s returning {ADMIN_COLUMNS}", (payload.role, target["email"])
    ).fetchone()


@router.put("/admins/{email}/name")
def set_admin_name(
    email: str, payload: AdminNameIn, user: GoogleUser = Depends(require_admin), conn: Connection = Depends(get_conn)
):
    """Every level may rename themselves. Another admin's name follows the rules of changing their level:
    not by a member, and a super admin's only by a super admin."""
    target = email.strip().lower()
    if target != user.email:
        if user.is_member:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "requires an admin")
        target = _target(conn, user, target)["email"]
    row = conn.execute(
        f"update admins set name = %s where email = %s returning {ADMIN_COLUMNS}", (payload.name, target)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not an admin")
    return row


@router.delete("/admins/{email}", status_code=status.HTTP_204_NO_CONTENT)
def remove_admin(email: str, user: GoogleUser = Depends(require_manager), conn: Connection = Depends(get_conn)):
    """Takes effect at once."""
    target = _target(conn, user, email)
    conn.execute("delete from admins where email = %s", (target["email"],))
    