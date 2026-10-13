"""Chat moderation for admins: a thin layer over the chat backend's /internal API.

Every action that changes something is logged here with the admin's email, after the chat
backend confirmed it, because the chat side does not know which admin acted.
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from psycopg import Connection

from .. import chat_client
from ..auth import GoogleUser, require_admin
from ..config import MAX_PAGE_SIZE
from ..db import get_conn

router = APIRouter(prefix="/api/admin/chat", tags=["chat moderation"], dependencies=[Depends(require_admin)])

Action = Literal["dismiss", "remove", "block", "unblock"]


def _log(conn: Connection, admin: GoogleUser, action: Action, message_id: int | None = None, user_id: UUID | None = None):
    conn.execute(
        "insert into moderation_actions (admin_email, action, message_id, user_id) values (%s, %s, %s, %s)",
        (admin.email, action, message_id, user_id),
    )


# ---------- Read (passed through as is) ----------

@router.get("/reported-messages")
def reported_messages():
    return chat_client.call("GET", "/reported-messages")


@router.get("/blocked-users")
def blocked_users():
    return chat_client.call("GET", "/blocked-users")


@router.get("/users/{user_id}/removed-messages")
def removed_messages(user_id: UUID):
    return chat_client.call("GET", f"/users/{user_id}/removed-messages")


# ---------- Actions (passed through, then logged) ----------

@router.post("/messages/{message_id}/dismiss")
def dismiss(message_id: int, admin: GoogleUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    result = chat_client.call("POST", f"/messages/{message_id}/dismiss")
    _log(conn, admin, "dismiss", message_id=message_id)
    return result


@router.post("/messages/{message_id}/remove")
def remove(message_id: int, admin: GoogleUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    result = chat_client.call("POST", f"/messages/{message_id}/remove")
    _log(conn, admin, "remove", message_id=message_id)
    return result


@router.post("/users/{user_id}/block")
def block(user_id: UUID, admin: GoogleUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    result = chat_client.call("POST", f"/users/{user_id}/block")
    _log(conn, admin, "block", user_id=user_id)
    return result


@router.post("/users/{user_id}/unblock")
def unblock(user_id: UUID, admin: GoogleUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    result = chat_client.call("POST", f"/users/{user_id}/unblock")
    _log(conn, admin, "unblock", user_id=user_id)
    return result


# ---------- Our own log ----------

@router.get("/actions")
def actions(
    action: Action | None = None,
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    conn: Connection = Depends(get_conn),
):
    """Moderation actions done from the console, newest first."""
    return conn.execute(
        """
        select id, admin_email, action, message_id, user_id, created_at
        from moderation_actions
        where (%(action)s::text is null or action = %(action)s::text)
        order by created_at desc, id desc
        limit %(limit)s
        """,
        {"action": action, "limit": limit},
    ).fetchall()
