"""Course messages: posting, replies, editing, deleting, paging, likes and reports."""

from app.services.messages import MAX_LENGTH, PAGE_SIZE

MISSING = 999999999


def post(student, course_id, content="hello", reply_to_id=None):
    return student.post(
        f"/courses/{course_id}/messages", json={"content": content, "reply_to_id": reply_to_id}
    )


def page(student, course_id, before=None):
    params = {"before": before} if before else {}
    return student.get(f"/courses/{course_id}/messages", params=params).json()


def other_course(guest, course_id):
    return next(c["id"] for c in guest.get("/courses").json() if c["id"] != course_id)


# Posting and reading


def test_post_and_read_newest_first(sign_in, guest, course_id):
    alice = sign_in("alice")
    assert post(alice, course_id, "first").status_code == 201
    assert post(alice, course_id, "second").status_code == 201
    messages = page(guest, course_id)["messages"]
    assert [m["content"] for m in messages] == ["second", "first"]


def test_is_mine_and_author_id_hidden(sign_in, course_id):
    alice, bob = sign_in("alice"), sign_in("bob")
    post(alice, course_id)
    assert page(alice, course_id)["messages"][0]["is_mine"] is True
    message = page(bob, course_id)["messages"][0]
    assert message["is_mine"] is False
    assert "user_id" not in message


def test_guest_cannot_post(guest, course_id):
    assert post(guest, course_id).status_code == 401


def test_unknown_course_is_404(sign_in, guest):
    assert guest.get(f"/courses/{MISSING}/messages").status_code == 404
    assert post(sign_in("alice"), MISSING).status_code == 404


def test_invalid_content_is_422(sign_in, course_id):
    alice = sign_in("alice")
    assert post(alice, course_id, "   ").status_code == 422
    assert post(alice, course_id, "x" * (MAX_LENGTH + 1)).status_code == 422
    assert post(alice, course_id, "fuck this").json()["detail"] == "offensive content"


def test_paging_with_before(sign_in, guest, course_id):
    alice = sign_in("alice")
    for i in range(PAGE_SIZE + 1):
        post(alice, course_id, f"message {i}")
    first = page(guest, course_id)
    assert len(first["messages"]) == PAGE_SIZE
    second = page(guest, course_id, before=first["next_before"])
    assert [m["content"] for m in second["messages"]] == ["message 0"]
    assert second["next_before"] is None


# Replies


def test_reply_shows_quote(sign_in, guest, course_id):
    alice, bob = sign_in("alice"), sign_in("bob")
    original = post(alice, course_id, "question").json()
    post(bob, course_id, "answer", reply_to_id=original["id"])
    reply = page(guest, course_id)["messages"][0]
    assert reply["reply_to_id"] == original["id"]
    assert reply["reply_to_content"] == "question"
    assert reply["reply_to_deleted"] is False


def test_reply_to_other_course_or_missing_is_404(sign_in, guest, course_id):
    alice = sign_in("alice")
    elsewhere = post(alice, other_course(guest, course_id)).json()
    assert post(alice, course_id, reply_to_id=elsewhere["id"]).status_code == 404
    assert post(alice, course_id, reply_to_id=MISSING).status_code == 404


# Editing and deleting


def test_edit_own_message(sign_in, guest, course_id):
    alice = sign_in("alice")
    message = post(alice, course_id, "typo").json()
    assert alice.put(f"/messages/{message['id']}", json={"content": "fixed"}).status_code == 200
    shown = page(guest, course_id)["messages"][0]
    assert shown["content"] == "fixed"
    assert shown["edited_at"] is not None


def test_cannot_edit_or_delete_others_message(sign_in, course_id):
    message = post(sign_in("alice"), course_id).json()
    bob = sign_in("bob")
    assert bob.put(f"/messages/{message['id']}", json={"content": "mine now"}).status_code == 404
    assert bob.delete(f"/messages/{message['id']}").status_code == 404


def test_edit_checks_content(sign_in, course_id):
    alice = sign_in("alice")
    message = post(alice, course_id).json()
    response = alice.put(f"/messages/{message['id']}", json={"content": "fuck"})
    assert response.status_code == 422


def test_delete_keeps_replies_with_deleted_quote(sign_in, guest, course_id):
    alice, bob = sign_in("alice"), sign_in("bob")
    original = post(alice, course_id, "question").json()
    post(bob, course_id, "answer", reply_to_id=original["id"])
    assert alice.delete(f"/messages/{original['id']}").status_code == 200
    messages = page(guest, course_id)["messages"]
    assert [m["content"] for m in messages] == ["answer"]
    assert messages[0]["reply_to_deleted"] is True
    assert messages[0]["reply_to_content"] is None


# Likes and reports


def test_like_is_idempotent_and_can_be_removed(sign_in, course_id):
    alice, bob = sign_in("alice"), sign_in("bob")
    message_id = post(alice, course_id).json()["id"]
    assert bob.put(f"/messages/{message_id}/like").json() == {"liked": True}
    bob.put(f"/messages/{message_id}/like")  # second click on "like" changes nothing
    shown = page(bob, course_id)["messages"][0]
    assert shown["like_count"] == 1
    assert shown["liked_by_me"] is True
    assert page(alice, course_id)["messages"][0]["liked_by_me"] is False

    assert bob.delete(f"/messages/{message_id}/like").json() == {"liked": False}
    assert page(bob, course_id)["messages"][0]["like_count"] == 0


def test_like_missing_message_is_404(sign_in):
    assert sign_in("alice").put(f"/messages/{MISSING}/like").status_code == 404


def test_report_once_per_user(sign_in, course_id):
    message_id = post(sign_in("alice"), course_id).json()["id"]
    bob = sign_in("bob")
    assert bob.post(f"/messages/{message_id}/report").status_code == 201
    assert bob.post(f"/messages/{message_id}/report").status_code == 409
    assert sign_in("carol").post(f"/messages/{message_id}/report").status_code == 201
    assert bob.post(f"/messages/{MISSING}/report").status_code == 404