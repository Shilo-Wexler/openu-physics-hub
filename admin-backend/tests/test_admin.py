"""/api/admin basics: access, the dev bypass, /me and the course list."""

import pytest

from conftest import ADMIN_EMAIL, STUDENT_EMAIL, access, bearer, courses_from_csv


# ---------- Access ----------

@pytest.mark.parametrize(
    "headers, status",
    [
        ({}, 401),                                         # no token
        ({"Authorization": "Basic abc"}, 401),             # wrong scheme
        ({"Cf-Access-Jwt-Assertion": "not-a-token"}, 401),  # not a valid JWT
        (access(STUDENT_EMAIL), 403),                      # valid, but not an admin
    ],
)
def test_access(client, headers, status):
    assert client.get("/api/admin/me", headers=headers).status_code == status


def test_dev_bypass_only_when_enabled(client, monkeypatch):
    # Off (the default in tests): "dev" is just an invalid token.
    assert client.get("/api/admin/me", headers=bearer("dev")).status_code == 401
    monkeypatch.setattr("app.auth.DEV_AUTH_EMAIL", ADMIN_EMAIL)
    assert client.get("/api/admin/me", headers=bearer("dev")).status_code == 200
    # dev:<email> acts as that email, which still has to be an admin.
    assert client.get("/api/admin/me", headers=bearer(f"dev:{STUDENT_EMAIL}")).status_code == 403


def test_me(admin, client):
    assert admin("GET", "/me").json() == {"email": ADMIN_EMAIL, "name": None, "roles": ["admin"]}
    assert client.get("/api/admin/me", headers=access(STUDENT_EMAIL)).status_code == 403


# ---------- Courses ----------

def test_hebrew_response_has_utf8_charset(client):
    response = client.get("/api/admin/courses", headers=access(ADMIN_EMAIL))
    assert "charset=utf-8" in response.headers["content-type"]
    assert "כללי" in [c["name"] for c in response.json()]


def test_courses(admin):
    courses = admin("GET", "/courses").json()
    assert len(courses) == len(courses_from_csv())
    assert courses[0] == {"name": "כללי", "course_number": 0}  # "general" first
    