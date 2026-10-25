"""The admins table: who may use the console, and at which level.

Every level sees the list; committee and admins change it; only an admin gives, changes
or removes the admin level. Nobody changes or removes their own row, so an admin always
remains. Renaming yourself is the one exception: every level may do it.
"""

from psycopg import Connection

COLUMNS = "email, name, role, added_by, created_at"


class NotAnAdmin(Exception):
    pass


class AlreadyAnAdmin(Exception):
    pass


class OwnRow(Exception):
    """Changing the level of, or removing, your own row."""


class NeedsAdmin(Exception):
    """Giving or touching the admin level without being one."""


class NeedsManager(Exception):
    """Team changing someone else."""


def _guard_admin(actor_role: str, *roles: str) -> None:
    if "admin" in roles and actor_role != "admin":
        raise NeedsAdmin()


def _lock_target(conn: Connection, actor_email: str, actor_role: str, email: str) -> str:
    """The email of the admin row being changed or removed, locked until the change is saved."""
    target = email.strip().lower()
    if target == actor_email:
        raise OwnRow()
    row = conn.execute("select email, role from admins where email = %s for update", (target,)).fetchone()
    if row is None:
        raise NotAnAdmin()
    _guard_admin(actor_role, row["role"])
    return row["email"]


def list_all(conn: Connection) -> list[dict]:
    return conn.execute(f"select {COLUMNS} from admins order by created_at, email").fetchall()


def find(conn: Connection, email: str) -> dict | None:
    """The role and name of a signed-in email, or None when it is not an admin. Checked on every request."""
    return conn.execute("select role, name from admins where email = %s", (email,)).fetchone()


def add(conn: Connection, actor_email: str, actor_role: str, email: str, name: str, role: str) -> dict:
    """Takes effect at once: access is checked against this table on every request."""
    _guard_admin(actor_role, role)
    row = conn.execute(
        f"insert into admins (email, name, role, added_by) values (%s, %s, %s, %s) on conflict (email) do nothing "
        f"returning {COLUMNS}",
        (email, name, role, actor_email),
    ).fetchone()
    if row is None:
        raise AlreadyAnAdmin()
    return row


def set_role(conn: Connection, actor_email: str, actor_role: str, email: str, role: str) -> dict:
    """Takes effect on the admin's next request."""
    target = _lock_target(conn, actor_email, actor_role, email)
    _guard_admin(actor_role, role)
    return conn.execute(
        f"update admins set role = %s where email = %s returning {COLUMNS}", (role, target)
    ).fetchone()


def set_name(conn: Connection, actor_email: str, actor_role: str, email: str, name: str) -> dict:
    """Your own name: any level. Another admin's name follows the rules of changing their level."""
    target = email.strip().lower()
    if target != actor_email:
        if actor_role == "team":
            raise NeedsManager()
        target = _lock_target(conn, actor_email, actor_role, target)
    row = conn.execute(
        f"update admins set name = %s where email = %s returning {COLUMNS}", (name, target)
    ).fetchone()
    if row is None:
        raise NotAnAdmin()
    return row


def remove(conn: Connection, actor_email: str, actor_role: str, email: str) -> None:
    """Takes effect at once."""
    target = _lock_target(conn, actor_email, actor_role, email)
    conn.execute("delete from admins where email = %s", (target,))