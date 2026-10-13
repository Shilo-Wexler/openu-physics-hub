"""STUDENT-SIDE: POST /api/requests, the student submission. All tests here are marked "student"."""

import pytest

from conftest import STUDENT_EMAIL, run_sql

pytestmark = pytest.mark.student


def stored() -> list[tuple]:
    return run_sql("select email, course_name, status, is_opened from requests order by id")


def test_submit_creates_request(submit):
    response = submit()
    assert response.status_code == 201
    assert response.json() == {"ok": True}
    assert stored() == [(STUDENT_EMAIL, "מכניקה", "new", False)]


def test_general_course_accepted(submit):
    assert submit(course_name="כללי").status_code == 201


def test_email_is_stored_lowercase(submit):
    response = submit(id_token="Student@Test.com", email="Student@Test.com")
    assert response.status_code == 201
    assert stored()[0][0] == "student@test.com"


@pytest.mark.parametrize(
    "overrides, status",
    [
        ({"id_token": "not-a-token"}, 401),                         # Google rejects the token
        ({"id_token": f"unverified:{STUDENT_EMAIL}"}, 401),         # email not verified
        ({"email": "someone-else@test.com"}, 401),                  # email does not match the token
        ({"course_name": "קורס שלא קיים"}, 422),
        ({"body": ""}, 422),
        ({"body": "   "}, 422),
        ({"body": "א" * 5001}, 422),
        ({"full_name": "a" * 101}, 422),
    ],
)
def test_rejected(submit, overrides, status):
    assert submit(**overrides).status_code == status
    assert stored() == []


def test_body_at_limit_accepted(submit):
    assert submit(body="א" * 5000).status_code == 201


def test_missing_field(client):
    assert client.post("/api/requests", json={"id_token": STUDENT_EMAIL}).status_code == 422


def test_duplicate_rejected(submit):
    assert submit(body="אותו טקסט").status_code == 201
    assert submit(body="אותו טקסט").status_code == 409
    assert len(stored()) == 1


def test_rate_limit(submit):
    for i in range(5):
        assert submit(body=f"פנייה {i}").status_code == 201
    assert submit(body="פנייה שישית").status_code == 429
    # Another student is not affected.
    assert submit(id_token="other@test.com", email="other@test.com").status_code == 201


def test_old_requests_do_not_count_for_rate_limit(submit):
    for i in range(5):
        submit(body=f"פנייה {i}")
    run_sql("update requests set created_at = now() - interval '2 hours'")
    assert submit(body="אחרי שעתיים").status_code == 201


def test_blocked_sender(submit):
    run_sql("insert into blocked_emails (email) values (%s)", (STUDENT_EMAIL,))
    response = submit()
    assert response.status_code == 403
    # Generic answer: the sender is not told they are blocked.
    assert response.json() == {"detail": "request not accepted"}
    assert stored() == []

