"""Chat moderation from the console, over the chat backend's /internal API (services/chat_client.py).

Every action that changes something is logged here with the admin's email, after the chat
backend confirmed it, because the chat side does not know which admin acted. The log can undo
an action: the opposite action is sent to the chat backend and logged too, pointing at the one it undid.
The log lists only the actions themselves; an undo shows on the action it undid (who and when), not as a row.
"""

from typing import Any, Literal
from urllib.parse import urlencode
from uuid import UUID

from psycopg import Connection

from app.services import chat_client

# reopen and restore are only ever undos (of dismiss and remove).
Action = Literal["dismiss", "remove", "block", "unblock", "reopen", "restore"]

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


class ActionNotFound(Exception):
    pass


class CannotUndo(Exception):
    """Not the latest action on its message or user, or undone already."""


class AlreadyUndone(Exception):
    """Two admins undid the same action at once; the other one was first."""


def _log(
    conn: Connection,
    admin_email: str,
    action: Action,
    message_id: int | None = None,
    user_id: UUID | None = None,
    undoes: int | None = None,
) -> None:
    logged = conn.execute(
        """
        insert into moderation_actions (admin_email, action, message_id, user_id, undoes)
        values (%s, %s, %s, %s, %s)
        on conflict (undoes) do nothing
        returning id
        """,
        (admin_email, action, message_id, user_id, undoes),
    ).fetchone()
    if logged is None:
        raise AlreadyUndone()


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
    except chat_client.ChatError:
        messages, users = {}, {}
    for row in rows:
        row["message"] = messages.get(str(row["message_id"]))
        row["user"] = users.get(str(row["user_id"]))
    return rows


# ---------- Read (passed through as is) ----------

def reported_messages() -> Any:
    return chat_client.call("GET", "/reported-messages")


def blocked_users() -> Any:
    return chat_client.call("GET", "/blocked-users")


def removed_messages(user_id: UUID) -> Any:
    return chat_client.call("GET", f"/users/{user_id}/removed-messages")


# ---------- Actions (done by the chat backend, then logged) ----------

def on_message(conn: Connection, admin_email: str, action: Literal["dismiss", "remove"], message_id: int) -> Any:
    result = chat_client.call("POST", f"/messages/{message_id}/{action}")
    _log(conn, admin_email, action, message_id=message_id)
    return result


def on_user(conn: Connection, admin_email: str, action: Literal["block", "unblock"], user_id: UUID) -> Any:
    result = chat_client.call("POST", f"/users/{user_id}/{action}")
    _log(conn, admin_email, action, user_id=user_id)
    return result


# ---------- Our own log ----------

def list_actions(conn: Connection, action: str | None, limit: int) -> list[dict]:
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
        raise ActionNotFound()
    return row


def get_action(conn: Connection, action_id: int) -> dict:
    return _with_details([_one(conn, action_id)])[0]


def undo(conn: Connection, admin_email: str, action_id: int) -> dict:
    """Sends the opposite action to the chat backend and logs it as the undo of this one.
    The chat backend may refuse too (409, Refused) when the message has changed since."""
    done = _one(conn, action_id)
    if not done["can_undo"]:
        raise CannotUndo()
    inverse = INVERSE[done["action"]]
    if done["message_id"] is not None:
        chat_client.call("POST", f"/messages/{done['message_id']}/{inverse}")
    else:
        chat_client.call("POST", f"/users/{done['user_id']}/{inverse}")
    _log(conn, admin_email, inverse, message_id=done["message_id"], user_id=done["user_id"], undoes=action_id)
    return {"undone": action_id, "action": inverse}