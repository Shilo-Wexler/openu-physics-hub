"""The /internal moderation API used by the admin console."""

from uuid import uuid4

import pytest

MISSING = 999999999


def post(student, course_id, content="hello"):
    return student.post(f"/courses/{course_id}/messages", json={"content": content})


@pytest.fixture
def admin(guest, mod_headers):
    """admin("GET", "/blocked-users") calls /internal like the admin backend does."""

    def call(method: str, path: str):
        return guest.request(method, f"/internal{path}", headers=mod_headers)

    return call


@pytest.fixture
def reported(sign_in, course_id):
    """A message by alice, reported by bob and carol."""
    alice = sign_in("alice")
    message = post(alice, course_id, "spam").json()
    for name in ["bob", "carol"]:
        sign_in(name).post(f"/messages/{message['id']}/report")
    return alice, message


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong-token"}, {"Authorization": "wrong-token"}],
)
def test_requires_token(guest, headers):
    assert guest.get("/internal/reported-messages", headers=headers).status_code == 401


def test_student_session_is_not_enough(sign_in):
    assert sign_in("alice").get("/internal/blocked-users").status_code == 401


def test_reported_messages_list(admin, reported):
    alice, message = reported
    items = admin("GET", "/reported-messages").json()
    assert len(items) == 1
    assert items[0]["message_id"] == message["id"]
    assert items[0]["author_id"] == alice.user_id
    assert items[0]["report_count"] == 2
    assert items[0]["author_blocked"] is False


def test_dismiss_keeps_message(admin, guest, reported, course_id):
    _, message = reported
    assert admin("POST", f"/messages/{message['id']}/dismiss").json() == {"dismissed_reports": 2}
    assert admin("GET", "/reported-messages").json() == []
    shown = guest.get(f"/courses/{course_id}/messages").json()["messages"]
    assert [m["id"] for m in shown] == [message["id"]]


def test_remove_hides_message_and_counts_for_author(admin, guest, reported, course_id):
    alice, message = reported
    assert admin("POST", f"/messages/{message['id']}/remove").status_code == 200
    assert admin("POST", f"/messages/{message['id']}/remove").status_code == 200  # safe to repeat
    assert guest.get(f"/courses/{course_id}/messages").json()["messages"] == []
    assert admin("GET", "/reported-messages").json() == []

    removed = admin("GET", f"/users/{alice.user_id}/removed-messages").json()
    assert [m["message_id"] for m in removed] == [message["id"]]


def test_block_and_unblock(admin, sign_in, course_id):
    alice = sign_in("alice")
    assert admin("POST", f"/users/{alice.user_id}/block").status_code == 200

    # A blocked user can still read, but not write.
    assert alice.get(f"/courses/{course_id}/messages").status_code == 200
    assert post(alice, course_id).status_code == 403
    assert [u["user_id"] for u in admin("GET", "/blocked-users").json()] == [alice.user_id]

    assert admin("POST", f"/users/{alice.user_id}/unblock").status_code == 200
    assert admin("GET", "/blocked-users").json() == []
    assert post(alice, course_id).status_code == 201


def test_unknown_ids(admin):
    assert admin("POST", f"/messages/{MISSING}/remove").status_code == 404
    assert admin("POST", f"/users/{uuid4()}/block").status_code == 404
    assert admin("GET", f"/users/{uuid4()}/removed-messages").status_code == 404
    assert admin("POST", "/users/not-a-uuid/block").status_code == 422