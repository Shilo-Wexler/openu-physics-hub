"""Console basics: who am I, the course list, and the admins table. All endpoints require an admin."""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from app.core.db import get_conn
from app.routes.deps import GoogleUser, require_admin, require_manager
from app.schemas.admins import AdminNameIn, AdminRole, NewAdmin
from app.services import admins, courses

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

# What each error of services/admins.py means for the console.
_ERRORS: dict[type[Exception], tuple[int, str]] = {
    admins.NotAnAdmin: (status.HTTP_404_NOT_FOUND, "not an admin"),
    admins.AlreadyAnAdmin: (status.HTTP_409_CONFLICT, "already an admin"),
    admins.OwnRow: (status.HTTP_409_CONFLICT, "you cannot change or remove yourself"),
    admins.NeedsSuperAdmin: (status.HTTP_403_FORBIDDEN, "requires a super admin"),
    admins.NeedsManager: (status.HTTP_403_FORBIDDEN, "requires an admin"),
}


@contextmanager
def _http_errors() -> Iterator[None]:
    try:
        yield
    except tuple(_ERRORS) as exc:
        code, detail = _ERRORS[type(exc)]
        raise HTTPException(code, detail) from None


# ---------- Who am I ----------

@router.get("/me")
def me(user: GoogleUser = Depends(require_admin)):
    """200 with the admin's email, name and level; 401/403 come from require_admin.
    The frontend uses it as the admin check."""
    return {"email": user.email, "name": user.name, "role": user.role}


# ---------- Courses ----------

@router.get("/courses")
def list_courses(conn: Connection = Depends(get_conn)):
    return courses.list_active(conn)


# ---------- Admins (rules in services/admins.py) ----------

@router.get("/admins")
def list_admins(conn: Connection = Depends(get_conn)):
    return admins.list_all(conn)


@router.post("/admins", status_code=status.HTTP_201_CREATED)
def add_admin(payload: NewAdmin, user: GoogleUser = Depends(require_manager), conn: Connection = Depends(get_conn)):
    with _http_errors():
        return admins.add(conn, user.email, user.role, payload.email, payload.name, payload.role)


@router.put("/admins/{email}/role")
def set_admin_role(
    email: str, payload: AdminRole, user: GoogleUser = Depends(require_manager), conn: Connection = Depends(get_conn)
):
    with _http_errors():
        return admins.set_role(conn, user.email, user.role, email, payload.role)


@router.put("/admins/{email}/name")
def set_admin_name(
    email: str, payload: AdminNameIn, user: GoogleUser = Depends(require_admin), conn: Connection = Depends(get_conn)
):
    with _http_errors():
        return admins.set_name(conn, user.email, user.role, email, payload.name)


@router.delete("/admins/{email}", status_code=status.HTTP_204_NO_CONTENT)
def remove_admin(email: str, user: GoogleUser = Depends(require_manager), conn: Connection = Depends(get_conn)):
    with _http_errors():
        admins.remove(conn, user.email, user.role, email)