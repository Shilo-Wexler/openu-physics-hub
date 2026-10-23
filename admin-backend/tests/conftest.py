"""Shared test setup: a throwaway database, one app client, a test Cloudflare Access key,
a fake Turnstile, and data helpers."""

import csv
import os
import time
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse

import jwt
import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.exceptions import PyJWKClientError

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
if not TEST_DATABASE_URL:
    pytest.exit("set TEST_DATABASE_URL, e.g. postgresql://postgres:pw@localhost/admin_test", returncode=2)
# The schema is dropped on every run, so refuse anything that is not a test database.
if not urlparse(TEST_DATABASE_URL).path.endswith("_test"):
    pytest.exit("TEST_DATABASE_URL must point to a database whose name ends with _test", returncode=2)

ACCESS_TEAM_DOMAIN = "test.cloudflareaccess.com"
ACCESS_AUD = "test-aud"

# Settings are read when the app is imported, so they are set before the imports below.
# ENV and DEV_AUTH_EMAIL are set (not removed) so a local .env cannot turn dev mode on.
os.environ["ENV"] = "prod"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
os.environ["DEV_AUTH_EMAIL"] = ""
os.environ["CF_ACCESS_TEAM_DOMAIN"] = ACCESS_TEAM_DOMAIN
os.environ["CF_ACCESS_AUD"] = ACCESS_AUD
# The chat backend is never called for real: tests replace app.chat_client._send.
os.environ["CHAT_API_URL"] = "http://chat.test"
os.environ["MOD_API_TOKEN"] = "test-" + "x" * 32
os.environ.pop("MOD_API_TOKEN_FILE", None)
# Cloudflare Turnstile is never called for real: tests replace app.turnstile._send.
os.environ["TURNSTILE_SECRET"] = "test-turnstile-secret"
os.environ.pop("TURNSTILE_SECRET_FILE", None)

from fastapi.testclient import TestClient  # noqa: E402

from app import auth, turnstile  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = BACKEND_DIR / "db" / "migrations"
COURSES_CSV = BACKEND_DIR.parent / "shared" / "courses.csv"

ADMIN_EMAIL = "admin@test.com"
# Someone who can sign in but is not in the admins table.
STUDENT_EMAIL = "student@test.com"

# Stands in for Cloudflare's signing key. Tests sign real RS256 tokens with it.
ACCESS_KEY_ID = "test-key"
ACCESS_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

# The only Turnstile token the fake Cloudflare accepts.
TURNSTILE_OK = "turnstile-ok"


def bearer(token: str) -> dict:
    """A bearer token: a dev token ("dev", "dev:<email>"), or anything a test wants to see rejected."""
    return {"Authorization": f"Bearer {token}"}


def access_token(email: str, key=ACCESS_KEY, **overrides) -> str:
    """A Cloudflare Access JWT for this email, signed with the test key. Any claim can be overridden."""
    now = int(time.time())
    claims = {
        "email": email,
        "aud": [ACCESS_AUD],
        "iss": f"https://{ACCESS_TEAM_DOMAIN}",
        "iat": now,
        "exp": now + 3600,
        "sub": "test-user-id",
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": ACCESS_KEY_ID})


def access(email: str) -> dict:
    """Headers for a console request as this email, the way Cloudflare Access adds them."""
    return {auth.ACCESS_HEADER: access_token(email)}


ADMIN = access(ADMIN_EMAIL)


class _FakeJwks:
    """Stands in for Cloudflare's key endpoint only. Signature and claims are still verified for real."""

    def get_signing_key_from_jwt(self, token: str):
        if jwt.get_unverified_header(token).get("kid") != ACCESS_KEY_ID:
            raise PyJWKClientError("unknown key id")
        return SimpleNamespace(key=ACCESS_KEY.public_key())


class _FakeTurnstile:
    """Stands in for Cloudflare's siteverify call (turnstile._send). Accepts TURNSTILE_OK only.

    calls: every (secret, token) it was asked about, so tests can check it was (or was not) called.
    error: when set, raised instead of answering, like a network failure.
    error_codes: what a rejection reports, e.g. ["invalid-input-secret"] for a wrong secret.
    """

    def __init__(self):
        self.calls: list[tuple[str, str]] = []
        self.error: Exception | None = None
        self.error_codes: list[str] = ["invalid-input-response"]

    def __call__(self, secret: str, token: str) -> dict:
        self.calls.append((secret, token))
        if self.error is not None:
            raise self.error
        if token == TURNSTILE_OK:
            return {"success": True, "error-codes": []}
        return {"success": False, "error-codes": self.error_codes}


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


@pytest.fixture
def fake_turnstile(monkeypatch):
    """The fake Cloudflare Turnstile of the current test. Ask for it to change its answer or read its calls."""
    fake = _FakeTurnstile()
    monkeypatch.setattr(turnstile, "_send", fake)
    return fake


@pytest.fixture(autouse=True)
def _fresh_data(client, monkeypatch, fake_turnstile):
    """Each test starts with no inquiries, no announcements, no moderation log, one admin,
    a fake Turnstile and the test Cloudflare key."""
    run_sql("truncate inquiries, admins, moderation_actions, announcements restart identity")
    run_sql("insert into admins (email) values (%s)", (ADMIN_EMAIL,))
    monkeypatch.setattr(auth, "_jwks_client", _FakeJwks())
    monkeypatch.setattr(auth, "DEV_AUTH_EMAIL", None)


@pytest.fixture
def inquire(client):
    """inquire(content="...") posts through POST /api/inquiries, like the public form; any field can be
    overridden. The default passes every check and is saved."""

    def _inquire(**overrides):
        payload = {
            "course_id": 0,
            "type": "exams",
            "content": "Test inquiry",
            "website": "",
            "turnstile_token": TURNSTILE_OK,
        }
        payload.update(overrides)
        return client.post("/api/inquiries", json=payload)

    return _inquire


@pytest.fixture
def admin(client):
    """admin("GET", "/me") calls /api/admin/... as the test admin."""

    def _call(method: str, path: str, **kwargs):
        return client.request(method, f"/api/admin{path}", headers=ADMIN, **kwargs)

    return _call


@pytest.fixture
def add_inquiry():
    """add_inquiry(status="closed", type="staff") inserts an inquiry straight into the DB and returns its id.
    Console tests use this, so they do not depend on Turnstile or the public form."""

    def _add(**overrides) -> int:
        row = {"course_number": 0, "type": "exams", "content": "Test inquiry", "status": "new"}
        row.update(overrides)
        return run_sql(
            "insert into inquiries (course_number, type, content, status) "
            "values (%(course_number)s, %(type)s, %(content)s, %(status)s) returning id",
            row,
        )[0][0]

    return _add


@pytest.fixture
def admin_with_roles():
    """admin_with_roles("announcements") adds an admin with only these roles and returns the headers
    of a console request as that admin. For tests of who may and may not use a route."""

    def _add(*roles: str) -> dict:
        email = f"{'-'.join(roles)}@test.com"
        run_sql("insert into admins (email, roles) values (%s, %s)", (email, list(roles)))
        return access(email)

    return _add
