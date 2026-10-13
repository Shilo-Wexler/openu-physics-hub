"""Every error has the same shape, {"detail": "<short English text>"}, which the console maps to Hebrew."""

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from conftest import ADMIN


@pytest.mark.parametrize(
    "method, path, kwargs, detail",
    [
        ("POST", "/admins", {"json": {"email": "not-an-email"}}, "invalid email"),
        ("POST", "/admins", {"json": {}}, "missing email"),
        ("POST", "/admins", {"json": {"email": "a@b.co", "roles": ["owner"]}}, "invalid roles"),
        ("GET", "/requests", {"params": {"page_size": 1000}}, "invalid page_size"),
        ("GET", "/requests", {"params": {"sort": "name"}}, "invalid sort"),
        ("GET", "/requests/abc", {}, "invalid request_id"),
        ("POST", "/chat/users/not-a-uuid/block", {}, "invalid user_id"),
        ("POST", "/blocked", {"json": {"email": "x"}}, "invalid email"),
    ],
)
def test_validation_errors_are_one_short_detail(admin, method, path, kwargs, detail):
    response = admin(method, path, **kwargs)
    assert (response.status_code, response.json()) == (422, {"detail": detail})


def test_malformed_json_is_one_short_detail(client):
    response = client.post("/api/admin/admins", headers={**ADMIN, "Content-Type": "application/json"}, content=b"{oops")
    assert response.status_code == 422
    assert response.json()["detail"].startswith("invalid")


def test_student_submission_validation_is_one_short_detail(client):
    response = client.post("/api/requests", json={"id_token": "a@b.co", "email": "a@b.co", "full_name": "x",
                                                  "course_name": "מכניקה", "body": "א" * 5001})
    assert (response.status_code, response.json()) == (422, {"detail": "invalid body"})


def test_http_errors_keep_their_detail(admin):
    assert admin("GET", "/requests/999999").json() == {"detail": "request not found"}


def test_unexpected_errors_are_a_plain_500(client, monkeypatch):
    def broken():
        raise RuntimeError("database exploded")

    monkeypatch.setattr(db.pool, "connection", broken)
    response = TestClient(app, raise_server_exceptions=False).get("/api/admin/summary", headers=ADMIN)
    assert (response.status_code, response.json()) == (500, {"detail": "internal error"})
    assert "charset=utf-8" in response.headers["content-type"]
    assert "exploded" not in response.text  # internals never reach the client
