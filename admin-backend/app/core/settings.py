"""Settings read from environment variables (or a .env file in admin-backend/)."""

import os
from pathlib import Path

from dotenv import load_dotenv

# This file is admin-backend/app/core/settings.py, so admin-backend/ is two folders up.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

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


def _required_in_prod(name: str, env: str) -> str | None:
    """Required when ENV=prod. In dev it may be missing, and then the feature that needs it is off."""
    value = os.environ.get(name, "").strip() or None
    if value is None and env == "prod":
        raise RuntimeError(f"Missing required environment variable: {name} (required when ENV=prod)")
    return value


def _team_domain(value: str | None) -> str | None:
    """Accepts "team.cloudflareaccess.com" with or without https:// and a trailing slash."""
    if value is None:
        return None
    return value.removeprefix("https://").rstrip("/")


ENV = _environment()
DATABASE_URL = _required("DATABASE_URL")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

# Console sign-in: Cloudflare Access sits in front of the console and adds a signed JWT to every request.
# Team domain: Zero Trust dashboard -> Settings -> Custom pages, e.g. "openuvoice.cloudflareaccess.com".
# AUD: the Access application's "Application Audience (AUD) Tag".
CF_ACCESS_TEAM_DOMAIN = _team_domain(_required_in_prod("CF_ACCESS_TEAM_DOMAIN", ENV))
CF_ACCESS_AUD = _required_in_prod("CF_ACCESS_AUD", ENV)

# DEV ONLY. When set, the bearer token "dev" acts as this email and "dev:<email>" as any email,
# without Cloudflare. Lets you test endpoints from /docs. Only allowed when ENV=dev.
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


# Chat moderation (server to server, see chat-backend/docs/internal-api.md).
# Both optional: without them the rest of the console works and /api/admin/chat/* answers 503.
CHAT_API_URL = os.environ.get("CHAT_API_URL", "").strip().rstrip("/") or None
MOD_API_TOKEN = _optional_secret("MOD_API_TOKEN")
if MOD_API_TOKEN is not None and len(MOD_API_TOKEN) < 32:
    raise RuntimeError("MOD_API_TOKEN must be at least 32 characters")

# Inquiry form anti-bot check (Cloudflare Turnstile): the widget's secret key.
# Required when ENV=prod. In dev it may be missing, and then POST /api/inquiries answers 503.
# For local testing use Cloudflare's test secrets: 1x0000000000000000000000000000000AA always passes,
# 2x0000000000000000000000000000000AA always fails.
TURNSTILE_SECRET = _optional_secret("TURNSTILE_SECRET")
if TURNSTILE_SECRET is None and ENV == "prod":
    raise RuntimeError("Missing required environment variable: TURNSTILE_SECRET (required when ENV=prod)")

