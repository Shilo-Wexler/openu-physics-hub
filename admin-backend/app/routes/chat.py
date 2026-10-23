"""Chat moderation for admins: a thin layer over the chat backend's /internal API.

Every action that changes something is logged here with the admin's email, after the chat
backend confirmed it, because the chat side does not know which admin acted. The log can undo
an action: the opposite action is sent to the chat backend and logged too, pointing at the one it undid.
The log lists only the actions themselves; an undo shows on the action it undid (who and when), not as a row.
"""

from typing import Literal
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from .. import chat_client
from ..auth import GoogleUser, require_admin
from ..config import MAX_PAGE_SIZE
from ..db import get_conn

router = APIRouter(prefix="/api/admin/chat", tags=["chat moderation"], dependencies=[Depends(require_admin)])

# reopen and restore are only ever undos (of dismiss and remove).
Action = Literal["dismiss", "remove", "block", "unblock", "reopen", "restore"]

# What the log lists and filters by: everything but the undos.
Logged = Literal["dismiss", "remove", "block", "unblock"]

# What undoes each action. reopen and restore are not undone in turn: they put the message back
# in the reported list, where it is decided again.
INVERSE: dict[str, Action] = {"dismiss": "reopen", "remove": "restore", "block": "unblock", "unblock": "block"}

# One action with what the log shows about it. undone_by, undone_by_email, undone_at: the undo of it,
# if any. can_undo: it can be undone, which is only while it is the latest action on its message or
# user and not undone yet.
_SELECT = """
    select a.id, a.admin_email, a.action, a.message_id, a.user_id, a.created_at, a.undoes,
           u.id as undone_by, u.admin_email as undone_by_email, u.created_at as undone_at,
           (a.action in ('dismiss', 'remove', 'block', 'unblock')
            and u.id is null
            and not exists (
                select 1 from moderation_actions later
                where later.id > a.id
                  and (later.message_id = a.message_id or later.user_id = a.user_id)
            )) as can_undo
    from moderation_actions a
    left join moderation_actions u on u.undoes = a.id
"""


def _log(
    conn: Connection,
    admin: GoogleUser,
    action: Action,
    message_id: int | None = None,
    user_id: UUID | None = None,
    undoes: int | None = None,
):
    """Logs one action. An undo of an action already undone (two admins at once) is refused with 409."""
    logged = conn.execute(
        """
        insert into moderation_actions (admin_email, action, message_id, user_id, undoes)
        values (%s, %s, %s, %s, %s)
        on conflict (undoes) do nothing
        returning id
        """,
        (admin.email, action, message_id, user_id, undoes),
    ).fetchone()
    if logged is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "already undone")


def _details(path: str, ids: list, key: str) -> dict:
    """Asks the chat backend about many messages or users in one request: {id: details}."""
    if not ids:
        return {}
    rows = chat_client.call("GET", f"{path}?{urlencode({'ids': ids}, doseq=True)}")
    return {str(row[key]): row for row in rows}


def _with_details(rows: list[dict]) -> list[dict]:
    """Adds what the chat backend knows (nickname, course, text, state) to each logged action, so the log
    names people instead of ids. If the chat backend can't be reached, the log still loads, with ids only."""
    message_ids = sorted({row["message_id"] for row in rows if row["message_id"] is not None})
    user_ids = sorted({str(row["user_id"]) for row in rows if row["user_id"] is not None})
    try:
        messages = _details("/messages", message_ids, "message_id")
        users = _details("/users", user_ids, "user_id")
    except HTTPException:
        messages, users = {}, {}
    for row in rows:
        row["message"] = messages.get(str(row["message_id"]))
        row["user"] = users.get(str(row["user_id"]))
    return rows


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
    action: Logged | None = None,
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    conn: Connection = Depends(get_conn),
):
    """Moderation actions done from the console, newest first, with the chat backend's details.
    Undos are left out: each shows on the action it undid."""
    rows = conn.execute(
        _SELECT
        + """
        where a.undoes is null
          and (%(action)s::text is null or a.action = %(action)s::text)
        order by a.created_at desc, a.id desc
        limit %(limit)s
        """,
        {"action": action, "limit": limit},
    ).fetchall()
    return _with_details(rows)


def _one(conn: Connection, action_id: int) -> dict:
    row = conn.execute(_SELECT + " where a.id = %s", (action_id,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "action not found")
    return row


@router.get("/actions/{action_id}")
def action(action_id: int, conn: Connection = Depends(get_conn)):
    return _with_details([_one(conn, action_id)])[0]


@router.post("/actions/{action_id}/undo")
def undo(action_id: int, admin: GoogleUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    """Sends the opposite action to the chat backend and logs it as the undo of this one.
    409 when it can't be undone: not the latest on its target, undone already, or (from the chat
    backend) the message has changed since."""
    done = _one(conn, action_id)
    if not done["can_undo"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "cannot be undone")
    inverse = INVERSE[done["action"]]
    if done["message_id"] is not None:
        chat_client.call("POST", f"/messages/{done['message_id']}/{inverse}")
    else:
        chat_client.call("POST", f"/users/{done['user_id']}/{inverse}")
    _log(conn, admin, inverse, message_id=done["message_id"], user_id=done["user_id"], undoes=action_id)
    return {"undone": action_id, "action": inverse}
