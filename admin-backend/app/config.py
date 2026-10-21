"""Settings read from environment variables (or a .env file in admin-backend/)."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

ENVIRONMENTS = ("dev", "prod")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _environment() -> str:
    """ENV is "dev" or "prod". Unset means prod, so a forgotten setting never turns dev features on."""
    value = os.environ.get("ENV", "").strip().lower() or "prod"
    if value not in ENVIRONMENTS:
        raise RuntimeError(f"ENV must be one of {', '.join(ENVIRONMENTS)}, got {value!r}")
    return value


def _dev_auth_email(env: str) -> str | None:
    """DEV ONLY. Refuses to start when DEV_AUTH_EMAIL is set outside ENV=dev."""
    email = os.environ.get("DEV_AUTH_EMAIL", "").strip().lower() or None
    if email and env != "dev":
        raise RuntimeError("DEV_AUTH_EMAIL is allowed only when ENV=dev")
    return email


ENV = _environment()
DATABASE_URL = _required("DATABASE_URL")
GOOGLE_CLIENT_ID = _required("GOOGLE_CLIENT_ID")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

# DEV ONLY. When set, the bearer token "dev" acts as this email and "dev:<email>" as any email,
# without Google. Lets you test endpoints from /docs. Only allowed when ENV=dev.
DEV_AUTH_EMAIL = _dev_auth_email(ENV)


def _optional_secret(name: str) -> str | None:
    """A secret from the file named in NAME_FILE, or else from NAME. None when neither is set."""
    path = os.environ.get(f"{name}_FILE", "").strip()
    if path:
        with open(path) as f:
            value = f.read().strip()
    else:
        value = os.environ.get(name, "").strip()
    return value or None


# Chat moderation (server to server, see chat-backend/docs/moderation-api.md).
# Both optional: without them the request system works and /api/admin/chat/* answers 503.
CHAT_API_URL = os.environ.get("CHAT_API_URL", "").strip().rstrip("/") or None
MOD_API_TOKEN = _optional_secret("MOD_API_TOKEN")
if MOD_API_TOKEN is not None and len(MOD_API_TOKEN) < 32:
    raise RuntimeError("MOD_API_TOKEN must be at least 32 characters")
CHAT_TIMEOUT_SECONDS = 5

# STUDENT-SIDE: submission limits (spam protection) for POST /api/requests.
MAX_REQUESTS_PER_HOUR = 5
DUPLICATE_WINDOW_MINUTES = 5

# Admin list paging.
MAX_PAGE_SIZE = 100
