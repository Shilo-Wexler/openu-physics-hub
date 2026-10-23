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


# ---------- Undo ----------

def test_reopen_puts_a_dismissed_message_back_in_the_list(admin, reported):
    _, message = reported
    admin("POST", f"/messages/{message['id']}/dismiss")

    assert admin("POST", f"/messages/{message['id']}/reopen").json() == {"reopened_reports": 2}
    items = admin("GET", "/reported-messages").json()
    assert [(m["message_id"], m["report_count"]) for m in items] == [(message["id"], 2)]
    # Nothing is dismissed any more.
    assert admin("POST", f"/messages/{message['id']}/reopen").status_code == 409


def test_reopen_needs_the_message_in_the_chat(admin, reported):
    _, message = reported
    admin("POST", f"/messages/{message['id']}/dismiss")
    admin("POST", f"/messages/{message['id']}/remove")
    response = admin("POST", f"/messages/{message['id']}/reopen")
    assert response.status_code == 409
    assert response.json() == {"detail": "nothing to undo"}


def test_restore_brings_a_removed_message_back_for_a_new_decision(admin, guest, reported, course_id):
    alice, message = reported
    admin("POST", f"/messages/{message['id']}/remove")

    assert admin("POST", f"/messages/{message['id']}/restore").json() == {"reopened_reports": 2}
    shown = guest.get(f"/courses/{course_id}/messages").json()["messages"]
    assert [m["id"] for m in shown] == [message["id"]]
    assert [m["message_id"] for m in admin("GET", "/reported-messages").json()] == [message["id"]]
    assert admin("GET", f"/users/{alice.user_id}/removed-messages").json() == []
    # It is not removed any more.
    assert admin("POST", f"/messages/{message['id']}/restore").status_code == 409


def test_restore_never_brings_back_what_the_author_deleted(admin, reported):
    alice, message = reported
    assert alice.request("DELETE", f"/messages/{message['id']}").status_code in (200, 204)
    assert admin("POST", f"/messages/{message['id']}/restore").status_code == 409


def test_undo_of_unknown_messages(admin):
    assert admin("POST", f"/messages/{MISSING}/reopen").status_code == 404
    assert admin("POST", f"/messages/{MISSING}/restore").status_code == 404


# ---------- Details by id ----------

def test_messages_by_id(admin, reported):
    alice, message = reported
    admin("POST", f"/messages/{message['id']}/remove")

    # Deleted messages are included; ids that don't exist are left out.
    items = admin("GET", f"/messages?ids={message['id']}&ids={MISSING}").json()
    assert len(items) == 1
    item = items[0]
    assert item["message_id"] == message["id"]
    assert item["author_id"] == alice.user_id
    assert item["content"] == "spam"
    assert item["state"] == "removed"
    assert (item["open_reports"], item["all_reports"]) == (0, 2)


def test_users_by_id(admin, sign_in):
    alice = sign_in("alice")
    admin("POST", f"/users/{alice.user_id}/block")

    items = admin("GET", f"/users?ids={alice.user_id}&ids={uuid4()}").json()
    assert [u["user_id"] for u in items] == [alice.user_id]
    assert items[0]["nickname"]
    assert items[0]["blocked_at"] is not None


def test_details_need_valid_ids(admin):
    assert admin("GET", "/messages").status_code == 422
    assert admin("GET", "/users?ids=not-a-uuid").status_code == 422
    too_many = "&".join(f"ids={n}" for n in range(201))
    assert admin("GET", f"/messages?{too_many}").status_code == 422


def test_unknown_ids(admin):
    assert admin("POST", f"/messages/{MISSING}/remove").status_code == 404
    assert admin("POST", f"/users/{uuid4()}/block").status_code == 404
    assert admin("GET", f"/users/{uuid4()}/removed-messages").status_code == 404
    assert admin("POST", "/users/not-a-uuid/block").status_code == 422
