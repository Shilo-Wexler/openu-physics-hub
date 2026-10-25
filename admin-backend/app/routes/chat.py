"""Chat moderation for admins: /api/admin/chat. The work is in services/moderation.py."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.routes.deps import Admin, Conn, http_errors, require_admin
from app.services import chat_client, moderation

# The log's page size.
MAX_PAGE_SIZE = 100

# What the log lists and filters by: everything but the undos.
Logged = Literal["dismiss", "remove", "block", "unblock"]

router = APIRouter(prefix="/api/admin/chat", tags=["chat moderation"], dependencies=[Depends(require_admin)])

# What each error of the services means for the console. None: the error's own message is the detail.
_ERRORS = {
    chat_client.NotConfigured: (status.HTTP_503_SERVICE_UNAVAILABLE, None),
    chat_client.Unavailable: (status.HTTP_502_BAD_GATEWAY, None),
    moderation.ActionNotFound: (status.HTTP_404_NOT_FOUND, "action not found"),
    moderation.CannotUndo: (status.HTTP_409_CONFLICT, "cannot be undone"),
    moderation.AlreadyUndone: (status.HTTP_409_CONFLICT, "already undone"),
}


@contextmanager
def _chat_errors() -> Iterator[None]:
    """http_errors, plus the chat backend's own refusals (404/409/422), passed on with their status."""
    try:
        with http_errors(_ERRORS):
            yield
    except chat_client.Refused as exc:
        raise HTTPException(exc.status_code, str(exc)) from None


# ---------- Read (passed through as is) ----------

@router.get("/reported-messages")
def reported_messages():
    with _chat_errors():
        return moderation.reported_messages()


@router.get("/blocked-users")
def blocked_users():
    with _chat_errors():
        return moderation.blocked_users()


@router.get("/users/{user_id}/removed-messages")
def removed_messages(user_id: UUID):
    with _chat_errors():
        return moderation.removed_messages(user_id)


# ---------- Actions (passed through, then logged) ----------

@router.post("/messages/{message_id}/dismiss")
def dismiss(message_id: int, admin: Admin, conn: Conn):
    with _chat_errors():
        return moderation.on_message(conn, admin.email, "dismiss", message_id)


@router.post("/messages/{message_id}/remove")
def remove(message_id: int, admin: Admin, conn: Conn):
    with _chat_errors():
        return moderation.on_message(conn, admin.email, "remove", message_id)


@router.post("/users/{user_id}/block")
def block(user_id: UUID, admin: Admin, conn: Conn):
    with _chat_errors():
        return moderation.on_user(conn, admin.email, "block", user_id)


@router.post("/users/{user_id}/unblock")
def unblock(user_id: UUID, admin: Admin, conn: Conn):
    with _chat_errors():
        return moderation.on_user(conn, admin.email, "unblock", user_id)


# ---------- Our own log ----------

@router.get("/actions")
def actions(
    conn: Conn,
    action: Logged | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 50,
):
    return moderation.list_actions(conn, action, limit)


@router.get("/actions/{action_id}")
def action(action_id: int, conn: Conn):
    with _chat_errors():
        return moderation.get_action(conn, action_id)


@router.post("/actions/{action_id}/undo")
def undo(action_id: int, admin: Admin, conn: Conn):
    """409 when it can't be undone: not the latest on its target, undone already, or (from the chat
    backend) the message has changed since."""
    with _chat_errors():
        return moderation.undo(conn, admin.email, action_id)