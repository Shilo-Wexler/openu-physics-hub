"""/api/admin/chat: the admin side of the chat moderation API (the chat backend itself is faked)."""

import pytest
import requests

from app import chat_client
from conftest import ADMIN_EMAIL, STUDENT_EMAIL, access, run_sql

USER = "282a1af8-19c7-44ad-ab32-a3f800c83450"
REPORTED = [{"message_id": 197, "course_name": "מכניקה", "content": "ספאם", "author_id": USER, "report_count": 2}]


class FakeResponse:
    def __init__(self, status_code: int, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


@pytest.fixture
def chat(monkeypatch):
    """chat.reply(status, body) sets the next answers; chat.on(text, status, body) answers differently
    when the URL contains text; chat.calls records (method, url, headers)."""

    class Fake:
        calls: list = []
        answer = (200, {})
        answers: dict = {}
        error: Exception | None = None

        def reply(self, status_code, body):
            self.answer = (status_code, body)

        def on(self, text, status_code, body):
            self.answers[text] = (status_code, body)

        def fail(self, exc):
            self.error = exc

    fake = Fake()
    fake.calls = []
    fake.answers = {}

    def send(method, url, headers, timeout):
        fake.calls.append((method, url, headers))
        if fake.error:
            raise fake.error
        for text, answer in fake.answers.items():
            if text in url:
                return FakeResponse(*answer)
        return FakeResponse(*fake.answer)

    monkeypatch.setattr(chat_client, "_send", send)
    return fake


def logged():
    return run_sql("select admin_email, action, message_id, user_id::text from moderation_actions order by id")


def last_action_id() -> int:
    return run_sql("select max(id) from moderation_actions")[0][0]


# ---------- Pass-through and the shared token ----------

def test_reported_messages_pass_through(admin, chat):
    chat.reply(200, REPORTED)
    response = admin("GET", "/chat/reported-messages")
    assert response.status_code == 200
    assert response.json() == REPORTED
    method, url, headers = chat.calls[0]
    assert (method, url) == ("GET", "http://chat.test/internal/reported-messages")
    assert headers == {"Authorization": "Bearer test-" + "x" * 32}
    assert logged() == []  # reading is not logged


@pytest.mark.parametrize(
    "path, chat_path",
    [
        ("/chat/blocked-users", "/internal/blocked-users"),
        (f"/chat/users/{USER}/removed-messages", f"/internal/users/{USER}/removed-messages"),
    ],
)
def test_other_reads(admin, chat, path, chat_path):
    chat.reply(200, [])
    assert admin("GET", path).json() == []
    assert chat.calls[0][1] == "http://chat.test" + chat_path


# ---------- Actions are passed on and logged with the admin ----------

@pytest.mark.parametrize(
    "path, answer, row",
    [
        ("/chat/messages/197/dismiss", {"dismissed_reports": 2}, (ADMIN_EMAIL, "dismiss", 197, None)),
        ("/chat/messages/197/remove", {"status": "ok"}, (ADMIN_EMAIL, "remove", 197, None)),
        (f"/chat/users/{USER}/block", {"status": "ok"}, (ADMIN_EMAIL, "block", None, USER)),
        (f"/chat/users/{USER}/unblock", {"status": "ok"}, (ADMIN_EMAIL, "unblock", None, USER)),
    ],
)
def test_actions_are_logged(admin, chat, path, answer, row):
    chat.reply(200, answer)
    response = admin("POST", path)
    assert response.status_code == 200
    assert response.json() == answer
    assert chat.calls[0][:2] == ("POST", "http://chat.test/internal" + path.removeprefix("/chat"))
    assert logged() == [row]


def test_action_log_list(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/1/remove")
    admin("POST", f"/chat/users/{USER}/block")
    chat.reply(200, [])
    rows = admin("GET", "/chat/actions").json()
    assert [(r["action"], r["admin_email"]) for r in rows] == [("block", ADMIN_EMAIL), ("remove", ADMIN_EMAIL)]
    assert rows[0]["user_id"] == USER and rows[1]["message_id"] == 1
    assert [r["action"] for r in admin("GET", "/chat/actions", params={"action": "remove"}).json()] == ["remove"]


# ---------- The log names people: details from the chat backend ----------

def test_log_has_the_chat_details(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/197/remove")
    admin("POST", f"/chat/users/{USER}/block")
    chat.calls.clear()
    chat.on("/internal/messages?", 200, [{"message_id": 197, "author_nickname": "noa", "state": "removed"}])
    chat.on("/internal/users?", 200, [{"user_id": USER, "nickname": "noa", "blocked_at": "2026-10-23T20:00:00Z"}])

    block, remove = admin("GET", "/chat/actions").json()
    assert block["user"]["nickname"] == "noa" and block["message"] is None
    assert remove["message"]["state"] == "removed" and remove["user"] is None
    # One request for all the messages and one for all the users, whatever the log's length.
    assert [url for _, url, _ in chat.calls] == [
        "http://chat.test/internal/messages?ids=197",
        f"http://chat.test/internal/users?ids={USER}",
    ]


def test_log_loads_without_the_chat_backend(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/197/remove")
    chat.fail(requests.ConnectionError("refused"))
    rows = admin("GET", "/chat/actions").json()
    assert [(r["action"], r["message_id"], r["message"]) for r in rows] == [("remove", 197, None)]


def test_one_action(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/197/remove")
    action_id = last_action_id()
    chat.on("/internal/messages?", 200, [{"message_id": 197, "content": "ספאם"}])

    one = admin("GET", f"/chat/actions/{action_id}").json()
    assert (one["action"], one["message"]["content"], one["can_undo"], one["undone_by"]) == ("remove", "ספאם", True, None)
    assert admin("GET", "/chat/actions/999999").status_code == 404


# ---------- Undo ----------

@pytest.mark.parametrize(
    "path, chat_undo, inverse",
    [
        ("/chat/messages/197/dismiss", "/internal/messages/197/reopen", "reopen"),
        ("/chat/messages/197/remove", "/internal/messages/197/restore", "restore"),
        (f"/chat/users/{USER}/block", f"/internal/users/{USER}/unblock", "unblock"),
        (f"/chat/users/{USER}/unblock", f"/internal/users/{USER}/block", "block"),
    ],
)
def test_undo_sends_the_opposite_and_logs_it(admin, chat, path, chat_undo, inverse):
    chat.reply(200, {"status": "ok"})
    admin("POST", path)
    action_id = last_action_id()
    chat.calls.clear()

    response = admin("POST", f"/chat/actions/{action_id}/undo")
    assert response.status_code == 200, response.text
    assert response.json() == {"undone": action_id, "action": inverse}
    assert chat.calls[0][:2] == ("POST", "http://chat.test" + chat_undo)
    assert run_sql("select action, undoes from moderation_actions order by id desc limit 1") == [(inverse, action_id)]

    chat.reply(200, [])
    undone = admin("GET", f"/chat/actions/{action_id}").json()
    assert (undone["can_undo"], undone["undone_by"], undone["undone_by_email"]) == (False, last_action_id(), ADMIN_EMAIL)
    assert undone["undone_at"] is not None


def test_log_leaves_out_undos(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/197/remove")
    removed = last_action_id()
    admin("POST", f"/chat/actions/{removed}/undo")

    chat.reply(200, [])
    rows = admin("GET", "/chat/actions").json()
    # Only the remove, marked undone; the restore shows on it, not as a row of its own.
    assert [(r["id"], r["undone_by"]) for r in rows] == [(removed, last_action_id())]
    # The undo itself can still be read by its id.
    assert admin("GET", f"/chat/actions/{last_action_id()}").json()["undoes"] == removed
    # Undos are not a filter either.
    assert admin("GET", "/chat/actions", params={"action": "restore"}).status_code == 422


def test_undo_only_once(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/197/remove")
    action_id = last_action_id()
    assert admin("POST", f"/chat/actions/{action_id}/undo").status_code == 200

    response = admin("POST", f"/chat/actions/{action_id}/undo")
    assert (response.status_code, response.json()) == (409, {"detail": "cannot be undone"})
    # The undo itself (restore) is not undone in turn: the message is decided again from the reports.
    response = admin("POST", f"/chat/actions/{last_action_id()}/undo")
    assert response.status_code == 409


def test_only_the_latest_action_on_a_target_can_be_undone(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/197/dismiss")
    dismissed = last_action_id()
    admin("POST", "/chat/messages/197/remove")
    removed = last_action_id()
    admin("POST", "/chat/messages/198/dismiss")  # another message does not count

    chat.reply(200, [])
    can_undo = {r["id"]: r["can_undo"] for r in admin("GET", "/chat/actions").json()}
    assert (can_undo[dismissed], can_undo[removed]) == (False, True)
    chat.calls.clear()
    assert admin("POST", f"/chat/actions/{dismissed}/undo").status_code == 409
    assert chat.calls == []  # refused before the chat backend is asked


def test_undo_refused_by_the_chat_backend(admin, chat):
    chat.reply(200, {"status": "ok"})
    admin("POST", "/chat/messages/197/remove")
    action_id = last_action_id()
    # Its author had deleted it, or it changed since: the chat backend has nothing to undo.
    chat.reply(409, {"detail": "nothing to undo"})

    response = admin("POST", f"/chat/actions/{action_id}/undo")
    assert (response.status_code, response.json()) == (409, {"detail": "nothing to undo"})
    assert [row[1] for row in logged()] == ["remove"]  # the undo is not logged


def test_undo_of_a_missing_action(admin, chat):
    assert admin("POST", "/chat/actions/999999/undo").status_code == 404
    assert chat.calls == []


# ---------- Failures: nothing is logged ----------

def test_not_found_is_passed_on(admin, chat):
    chat.reply(404, {"detail": "message not found"})
    response = admin("POST", "/chat/messages/999/remove")
    assert (response.status_code, response.json()) == (404, {"detail": "message not found"})
    assert logged() == []


def test_chat_unreachable(admin, chat):
    chat.fail(requests.ConnectionError("refused"))
    response = admin("POST", "/chat/messages/1/remove")
    assert (response.status_code, response.json()) == (502, {"detail": "chat backend unavailable"})
    assert logged() == []


def test_chat_rejects_our_token(admin, chat):
    chat.reply(401, {"detail": "invalid token"})
    response = admin("GET", "/chat/reported-messages")
    assert (response.status_code, response.json()) == (502, {"detail": "chat backend rejected the moderation token"})


def test_chat_server_error(admin, chat):
    chat.reply(500, {"detail": "boom"})
    assert admin("POST", f"/chat/users/{USER}/block").status_code == 502
    assert logged() == []


def test_not_configured(admin, chat, monkeypatch):
    monkeypatch.setattr("app.config.CHAT_API_URL", None)
    response = admin("GET", "/chat/reported-messages")
    assert (response.status_code, response.json()) == (503, {"detail": "chat moderation is not configured"})
    assert chat.calls == []


# ---------- Checked before the chat backend is called ----------

def test_bad_user_id(admin, chat):
    assert admin("POST", "/chat/users/not-a-uuid/block").status_code == 422
    assert chat.calls == []


@pytest.mark.parametrize("headers, status", [({}, 401), (access(STUDENT_EMAIL), 403)])
def test_needs_admin(client, chat, headers, status):
    assert client.post("/api/admin/chat/messages/1/remove", headers=headers).status_code == status
    assert client.post("/api/admin/chat/actions/1/undo", headers=headers).status_code == status
    assert chat.calls == []
    assert logged() == []
