"""Shared test setup: a throwaway database, one app client, a fake Google, and request helpers."""

import csv
import os
from pathlib import Path
from urllib.parse import urlparse

import psycopg
import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
if not TEST_DATABASE_URL:
    pytest.exit("set TEST_DATABASE_URL, e.g. postgresql://postgres:pw@localhost/admin_test", returncode=2)
# The schema is dropped on every run, so refuse anything that is not a test database.
if not urlparse(TEST_DATABASE_URL).path.endswith("_test"):
    pytest.exit("TEST_DATABASE_URL must point to a database whose name ends with _test", returncode=2)

# Settings are read when the app is imported, so they are set before the imports below.
# DEV_AUTH_EMAIL is set to empty (not removed) so a local .env cannot turn the dev bypass on.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["GOOGLE_CLIENT_ID"] = "test-client"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
os.environ["DEV_AUTH_EMAIL"] = ""
# The chat backend is never called for real: tests replace app.chat_client._send.
os.environ["CHAT_API_URL"] = "http://chat.test"
os.environ["MOD_API_TOKEN"] = "test-" + "x" * 32
os.environ.pop("MOD_API_TOKEN_FILE", None)

from fastapi.testclient import TestClient  # noqa: E402

from app import auth  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = BACKEND_DIR / "db" / "migrations"
COURSES_CSV = BACKEND_DIR.parent / "shared" / "courses.csv"

ADMIN_EMAIL = "admin@test.com"
STUDENT_EMAIL = "student@test.com"


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


ADMIN = bearer(ADMIN_EMAIL)


def courses_from_csv() -> list[tuple[int, str]]:
    with open(COURSES_CSV, newline="", encoding="utf-8") as f:
        rows = csv.reader(f)
        next(rows)  # header
        return [(int(row[0]), row[1]) for row in rows]


def _apply_migration(conn, path: Path) -> None:
    """Runs one migration the way psql would, in order.

    psql's \\copy is not SQL, so it cannot go through psycopg. At that exact point the same CSV is
    loaded with COPY instead, so the statements after it (e.g. the "on conflict" insert of כללי)
    see the courses already loaded, the same as in a real psql run. Other \\ lines are skipped.
    """
    pending: list[str] = []

    def flush() -> None:
        sql = "\n".join(pending).strip()
        if sql:
            conn.execute(sql)
        pending.clear()

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.lstrip()
        if stripped.startswith("\\copy courses"):
            flush()
            with conn.cursor().copy("copy courses (course_number, name) from stdin") as copy:
                for row in courses_from_csv():
                    copy.write_row(row)
        elif not stripped.startswith("\\"):
            pending.append(line)
    flush()


def _build_schema() -> None:
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        conn.execute("drop schema public cascade; create schema public;")
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            _apply_migration(conn, path)


def run_sql(query: str, params=None) -> list[tuple]:
    """Runs one statement directly on the test DB (outside the app) and returns its rows, if any."""
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        cur = conn.execute(query, params)
        return cur.fetchall() if cur.description else []


@pytest.fixture(scope="session")
def client():
    _build_schema()
    with TestClient(app) as c:
        yield c


def _fake_verify(token, request, audience, clock_skew_in_seconds=0):
    """Stands in for Google: the token is the email. "unverified:<email>" has an unverified email."""
    if token.startswith("unverified:"):
        return {"email": token.split(":", 1)[1], "email_verified": False}
    if "@" not in token:
        raise ValueError("invalid token")
    return {"email": token, "email_verified": True, "name": "Test User"}


@pytest.fixture(autouse=True)
def _fresh_data(client, monkeypatch):
    """Each test starts with no requests, no blocks, one admin, and a fake Google."""
    run_sql("truncate requests, blocked_emails, admins, moderation_actions restart identity")
    run_sql("insert into admins (email) values (%s)", (ADMIN_EMAIL,))
    monkeypatch.setattr(auth.id_token, "verify_oauth2_token", _fake_verify)
    monkeypatch.setattr(auth, "DEV_AUTH_EMAIL", None)


@pytest.fixture
def submit(client):
    """STUDENT-SIDE. submit(body="...") posts through POST /api/requests, like a student; any field can be overridden.
    Only for tests of the student path. Admin tests create data with add_request instead."""

    def _submit(**overrides):
        payload = {
            "id_token": STUDENT_EMAIL,
            "email": STUDENT_EMAIL,
            "full_name": "ישראל ישראלי",
            "course_name": "מכניקה",
            "body": "פנייה לבדיקה",
        }
        payload.update(overrides)
        return client.post("/api/requests", json=payload)

    return _submit


@pytest.fixture
def admin(client):
    """admin("GET", "/summary") calls /api/admin/... as the test admin."""

    def _call(method: str, path: str, **kwargs):
        return client.request(method, f"/api/admin{path}", headers=ADMIN, **kwargs)

    return _call


@pytest.fixture
def add_request():
    """add_request(body="...", email="...") inserts a request straight into the DB and returns its id.
    Admin tests use this, so they do not depend on the student endpoint (POST /api/requests)."""

    def _add(**overrides) -> int:
        row = {"full_name": "ישראל ישראלי", "email": STUDENT_EMAIL, "course_name": "מכניקה", "body": "פנייה לבדיקה"}
        row.update(overrides)
        return run_sql(
            "insert into requests (full_name, email, course_name, body) "
            "values (%(full_name)s, %(email)s, %(course_name)s, %(body)s) returning id",
            row,
        )[0][0]

    return _add


@pytest.fixture
def new_request(add_request):
    """Creates one request and returns its id."""
    return add_request()
