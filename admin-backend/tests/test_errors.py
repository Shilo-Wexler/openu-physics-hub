"""Every error has the same shape, {"detail": "<short English text>"}, which the console maps to Hebrew."""

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from conftest import ADMIN, TURNSTILE_OK


@pytest.mark.parametrize(
    "method, path, kwargs, detail",
    [
        ("POST", "/admins", {"json": {"email": "not-an-email"}}, "invalid email"),
        ("POST", "/admins", {"json": {}}, "missing email"),
        ("POST", "/admins", {"json": {"email": "a@b.co", "roles": ["owner"]}}, "invalid roles"),
        ("GET", "/inquiries", {"params": {"before": 0}}, "invalid before"),
        ("GET", "/inquiries", {"params": {"status": "open"}}, "invalid status"),
        ("GET", "/inquiries/abc", {}, "invalid inquiry_id"),
        ("POST", "/chat/users/not-a-uuid/block", {}, "invalid user_id"),
    ],
)
def test_validation_errors_are_one_short_detail(admin, method, path, kwargs, detail):
    response = admin(method, path, **kwargs)
    assert (response.status_code, response.json()) == (422, {"detail": detail})


def test_malformed_json_is_one_short_detail(client):
    response = client.post("/api/admin/admins", headers={**ADMIN, "Content-Type": "application/json"}, content=b"{oops")
    assert response.status_code == 422
    assert response.json()["detail"].startswith("invalid")


def test_public_form_validation_is_one_short_detail(client):
    response = client.post(
        "/api/inquiries",
        json={"course_id": 0, "type": "exams", "content": "א" * 2001, "turnstile_token": TURNSTILE_OK},
    )
    assert (response.status_code, response.json()) == (422, {"detail": "invalid content"})


def test_http_errors_keep_their_detail(admin):
    assert admin("GET", "/inquiries/999999").json() == {"detail": "inquiry not found"}


def test_unexpected_errors_are_a_plain_500(client, monkeypatch):
    def broken():
        raise RuntimeError("database exploded")

    monkeypatch.setattr(db.pool, "connection", broken)
    response = TestClient(app, raise_server_exceptions=False).get("/api/admin/me", headers=ADMIN)
    assert (response.status_code, response.json()) == (500, {"detail": "internal error"})
    assert "charset=utf-8" in response.headers["content-type"]
    assert "exploded" not in response.text  # internals never reach the client
    