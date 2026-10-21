"""Public inquiry form, POST /api/inquiries: saving, the honeypot, Turnstile and input checks."""

import pytest
import requests

from app import turnstile
from conftest import TURNSTILE_OK, courses_from_csv, run_sql

# Every column the table may have. Guards anonymity: adding an identity column (ip, email, session)
# must be a deliberate change to this list, not a quiet one.
INQUIRY_COLUMNS = {
    "id", "course_number", "type", "content", "status",
    "handled_by", "internal_note", "created_at", "updated_at",
}


def saved() -> list[tuple]:
    return run_sql("select course_number, type, content, status, handled_by, internal_note from inquiries order by id")


def a_real_course() -> int:
    return next(number for number, _ in courses_from_csv() if number != 0)


# Saving

def test_inquiry_is_saved_as_new(inquire):
    r = inquire(course_id=0, type="exams", content="When is the exam?")
    assert r.status_code == 201
    assert r.json()["id"] > 0
    assert saved() == [(0, "exams", "When is the exam?", "new", None, None)]


def test_inquiry_on_a_course(inquire):
    course = a_real_course()
    assert inquire(course_id=course).status_code == 201
    assert saved()[0][0] == course


@pytest.mark.parametrize("kind", ["exams", "staff", "accessibility", "admin", "other"])
def test_every_type_is_accepted(inquire, kind):
    assert inquire(type=kind).status_code == 201


def test_content_is_trimmed(inquire):
    inquire(content="  hello  \n")
    assert saved()[0][2] == "hello"


def test_content_at_the_limit_is_accepted(inquire):
    assert inquire(content="a" * 2000).status_code == 201


def test_table_stores_no_identity():
    rows = run_sql("select column_name from information_schema.columns where table_name = 'inquiries'")
    assert {name for (name,) in rows} == INQUIRY_COLUMNS


# Honeypot

def test_honeypot_answers_201_and_saves_nothing(inquire, fake_turnstile):
    r = inquire(website="https://spam.example")
    assert r.status_code == 201
    assert saved() == []
    assert fake_turnstile.calls == []  # caught before any network call


def test_honeypot_without_token_still_answers_201(inquire, fake_turnstile):
    r = inquire(website="x", turnstile_token=None)
    assert r.status_code == 201
    assert saved() == []
    assert fake_turnstile.calls == []


# Turnstile

def test_token_is_checked_with_the_secret(inquire, fake_turnstile):
    inquire()
    assert fake_turnstile.calls == [("test-turnstile-secret", TURNSTILE_OK)]


@pytest.mark.parametrize("token", [None, ""])
def test_missing_token_is_rejected(inquire, fake_turnstile, token):
    r = inquire(turnstile_token=token)
    assert r.status_code == 422
    assert r.json() == {"detail": "missing turnstile_token"}
    assert saved() == []
    assert fake_turnstile.calls == []


def test_rejected_token(inquire):
    r = inquire(turnstile_token="bot-token")
    assert r.status_code == 422
    assert r.json() == {"detail": "invalid turnstile_token"}
    assert saved() == []


def test_too_long_token_is_rejected_without_a_call(inquire, fake_turnstile):
    r = inquire(turnstile_token="a" * 2049)
    assert r.status_code == 422
    assert r.json() == {"detail": "invalid turnstile_token"}
    assert fake_turnstile.calls == []


def test_cloudflare_unreachable_answers_503(inquire, fake_turnstile):
    fake_turnstile.error = requests.ConnectionError("down")
    r = inquire()
    assert r.status_code == 503
    assert r.json() == {"detail": "verification unavailable, try again later"}
    assert saved() == []


def test_bad_answer_from_cloudflare_answers_503(inquire, fake_turnstile):
    fake_turnstile.error = ValueError("not json")
    assert inquire().status_code == 503
    assert saved() == []


@pytest.mark.parametrize("code", ["invalid-input-secret", "missing-input-secret"])
def test_wrong_secret_answers_503_not_422(inquire, fake_turnstile, code):
    fake_turnstile.error_codes = [code]
    r = inquire(turnstile_token="any-token")
    assert r.status_code == 503
    assert saved() == []


def test_no_secret_configured_answers_503(inquire, fake_turnstile, monkeypatch):
    monkeypatch.setattr(turnstile, "TURNSTILE_SECRET", None)
    r = inquire()
    assert r.status_code == 503
    assert r.json() == {"detail": "inquiries are not configured"}
    assert fake_turnstile.calls == []


# Input checks

def test_unknown_course(inquire):
    unknown = max(number for number, _ in courses_from_csv()) + 1
    r = inquire(course_id=unknown)
    assert r.status_code == 422
    assert r.json() == {"detail": "unknown course"}


@pytest.mark.parametrize(
    ("overrides", "detail"),
    [
        ({"course_id": -1}, "invalid course_id"),
        ({"course_id": "abc"}, "invalid course_id"),
        ({"type": "spam"}, "invalid type"),
        ({"content": ""}, "invalid content"),
        ({"content": "   "}, "invalid content"),
        ({"content": "a" * 2001}, "invalid content"),
    ],
)
def test_invalid_fields(inquire, overrides, detail):
    r = inquire(**overrides)
    assert r.status_code == 422
    assert r.json() == {"detail": detail}
    assert saved() == []


@pytest.mark.parametrize("field", ["course_id", "type", "content"])
def test_missing_fields(client, field):
    payload = {"course_id": 0, "type": "exams", "content": "Test inquiry", "turnstile_token": TURNSTILE_OK}
    del payload[field]
    r = client.post("/api/inquiries", json=payload)
    assert r.status_code == 422
    assert r.json() == {"detail": f"missing {field}"}