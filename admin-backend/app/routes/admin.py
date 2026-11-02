"""Console basics: who am I, the course list, and the admins table. All endpoints require an admin."""

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.routes.deps import Admin, Conn, Manager, http_errors, require_admin
from app.schemas.admins import AdminNameIn, AdminRole, NewAdmin
from app.services import access_sync, admins, courses

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

# What each error of services/admins.py means for the console.
_ERRORS = {
    admins.NotAnAdmin: (status.HTTP_404_NOT_FOUND, "not an admin"),
    admins.AlreadyAnAdmin: (status.HTTP_409_CONFLICT, "already an admin"),
    admins.OwnRow: (status.HTTP_409_CONFLICT, "you cannot change or remove yourself"),
    admins.NeedsAdmin: (status.HTTP_403_FORBIDDEN, "requires an admin"),
    admins.NeedsManager: (status.HTTP_403_FORBIDDEN, "requires a committee member"),
}


def _sync_access(conn: Conn, background_tasks: BackgroundTasks) -> None:
    """After adding or removing an admin: saves the change now, so the sync (on its own connection)
    reads the new list, and updates Cloudflare Access after the response is sent."""
    conn.commit()
    background_tasks.add_task(access_sync.sync_in_background)


# ---------- Who am I ----------

@router.get("/me")
def me(user: Admin):
    """200 with the admin's email, name and level; 401/403 come from require_admin.
    The frontend uses it as the admin check."""
    return {"email": user.email, "name": user.name, "role": user.role}


# ---------- Courses ----------

@router.get("/courses")
def list_courses(conn: Conn):
    return courses.list_active(conn)


# ---------- Admins (rules in services/admins.py) ----------

@router.get("/admins")
def list_admins(conn: Conn):
    return admins.list_all(conn)


@router.post("/admins", status_code=status.HTTP_201_CREATED)
def add_admin(payload: NewAdmin, user: Manager, conn: Conn, background_tasks: BackgroundTasks):
    with http_errors(_ERRORS):
        row = admins.add(conn, user.email, user.role, payload.email, payload.name, payload.role)
    _sync_access(conn, background_tasks)
    return row


@router.put("/admins/{email}/role")
def set_admin_role(email: str, payload: AdminRole, user: Manager, conn: Conn):
    with http_errors(_ERRORS):
        return admins.set_role(conn, user.email, user.role, email, payload.role)


@router.put("/admins/{email}/name")
def set_admin_name(email: str, payload: AdminNameIn, user: Admin, conn: Conn):
    with http_errors(_ERRORS):
        return admins.set_name(conn, user.email, user.role, email, payload.name)


@router.delete("/admins/{email}", status_code=status.HTTP_204_NO_CONTENT)
def remove_admin(email: str, user: Manager, conn: Conn, background_tasks: BackgroundTasks):
    with http_errors(_ERRORS):
        admins.remove(conn, user.email, user.role, email)
    _sync_access(conn, background_tasks)