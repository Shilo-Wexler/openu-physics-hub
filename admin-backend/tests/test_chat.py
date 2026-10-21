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
    """chat.reply(status, body) sets the next answers; chat.calls records (method, url, headers)."""

    class Fake:
        calls: list = []
        answer = (200, {})
        error: Exception | None = None

        def reply(self, status_code, body):
            self.answer = (status_code, body)

        def fail(self, exc):
            self.error = exc

    fake = Fake()
    fake.calls = []

    def send(method, url, headers, timeout):
        fake.calls.append((method, url, headers))
        if fake.error:
            raise fake.error
        return FakeResponse(*fake.answer)

    monkeypatch.setattr(chat_client, "_send", send)
    return fake


def logged():
    return run_sql("select admin_email, action, message_id, user_id::text from moderation_actions order by id")


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
    rows = admin("GET", "/chat/actions").json()
    assert [(r["action"], r["admin_email"]) for r in rows] == [("block", ADMIN_EMAIL), ("remove", ADMIN_EMAIL)]
    assert rows[0]["user_id"] == USER and rows[1]["message_id"] == 1
    assert [r["action"] for r in admin("GET", "/chat/actions", params={"action": "remove"}).json()] == ["remove"]


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
    assert chat.calls == []
    assert logged() == []
