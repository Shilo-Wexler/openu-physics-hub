"""Shared test setup: a throwaway database, one app client, and signed-in students."""

import asyncio
import csv
import os
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
if not TEST_DATABASE_URL:
    pytest.exit("set TEST_DATABASE_URL, e.g. postgresql://localhost/chat_test", returncode=2)
# The schema is dropped on every run, so refuse anything that is not a test database.
if not urlparse(TEST_DATABASE_URL).path.endswith("_test"):
    pytest.exit("TEST_DATABASE_URL must point to a database whose name ends with _test", returncode=2)

# Settings are read when the app is imported, so they are set before the imports below.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["GOOGLE_CLIENT_ID"] = "test-client"
os.environ["MOD_API_TOKEN"] = "test-" + "x" * 32
os.environ.pop("DATABASE_URL_FILE", None)
os.environ.pop("MOD_API_TOKEN_FILE", None)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import API_PREFIX, app  # noqa: E402
from app.routes.deps import SESSION_COOKIE  # noqa: E402
from app.services import google_auth  # noqa: E402
from app.services.courses import GENERAL_COURSE_ID  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = BACKEND_DIR / "db" / "migrations"
COURSES_CSV = BACKEND_DIR.parent / "shared" / "courses.csv"

MOD_HEADERS = {"Authorization": f"Bearer {os.environ['MOD_API_TOKEN']}"}


def _courses() -> list[tuple[int, str]]:
    with open(COURSES_CSV, newline="", encoding="utf-8") as f:
        rows = csv.reader(f)
        next(rows)  # header
        return [(int(row[0]), row[1]) for row in rows]


async def _build_schema() -> None:
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        await conn.execute("drop schema public cascade; create schema public;")
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            await conn.execute(path.read_text())
        await conn.copy_records_to_table("courses", records=_courses(), columns=["id", "name"])
    finally:
        await conn.close()


async def _clear_users() -> None:
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        # Every user-made row (sessions, messages, likes, ...) references users, so cascade clears it all.
        await conn.execute("truncate users cascade")
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def client():
    asyncio.run(_build_schema())
    # https: the session cookie is Secure, so it is not sent over plain http.
    with TestClient(app, base_url="https://testserver") as c:
        yield c


@pytest.fixture(autouse=True)
def _fresh_users(client, monkeypatch):
    """Each test starts with no users, and Google sign-in accepts any token."""
    asyncio.run(_clear_users())

    async def fake_verify(token: str) -> str:
        return token  # the token itself is used as the Google user id

    monkeypatch.setattr(google_auth, "verify_id_token", fake_verify)


class Student:
    """A browser of one user. Every request sends only this student's session cookie."""

    def __init__(self, client: TestClient, token: str | None = None, user_id: str | None = None):
        self.client = client
        self.token = token
        self.user_id = user_id

    def request(self, method: str, url: str, **kwargs):
        # Tests use public paths without the prefix ("/courses"); the unprefixed routes stay as is.
        if not url.startswith(("/internal", "/health")):
            url = API_PREFIX + url
        # One client is shared by all students, so its cookie jar is reset per request.
        self.client.cookies.clear()
        if self.token:
            self.client.cookies.set(SESSION_COOKIE, self.token)
        return self.client.request(method, url, **kwargs)

    def get(self, url: str, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs):
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs):
        return self.request("PUT", url, **kwargs)

    def delete(self, url: str, **kwargs):
        return self.request("DELETE", url, **kwargs)


@pytest.fixture
def sign_in(client):
    """sign_in("alice") returns a signed-in Student; the same name gives the same user."""

    def _sign_in(google_id: str) -> Student:
        response = Student(client).post("/auth/google", json={"id_token": google_id})
        assert response.status_code == 200
        return Student(client, response.cookies[SESSION_COOKIE], response.json()["user_id"])

    return _sign_in


@pytest.fixture
def guest(client) -> Student:
    return Student(client)


@pytest.fixture
def mod_headers() -> dict:
    return MOD_HEADERS


@pytest.fixture(scope="session")
def course_id() -> int:
    """Any real course from the shared list (not the general chat)."""
    return next(id_ for id_, _ in _courses() if id_ != GENERAL_COURSE_ID)