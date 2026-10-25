"""Console sign-in (Cloudflare Access JWT), the admin and level checks, and turning the services'
exceptions into HTTP errors.

Routes use the short dependency names below: conn: Conn, user: Admin, user: Manager.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError, PyJWKClientConnectionError, PyJWKClientError
from psycopg import Connection

from app.core.db import get_conn
from app.core.settings import CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN, DEV_AUTH_EMAIL
from app.services import admins

# Adds the "Authorize" button in /docs (for the dev tokens). auto_error=False so we return our own 401.
_bearer = HTTPBearer(auto_error=False)

ACCESS_HEADER = "Cf-Access-Jwt-Assertion"
CLOCK_SKEW_SECONDS = 10
# Cloudflare's public signing keys. PyJWKClient caches them, so they are not downloaded on every request.
_jwks_client = (
    jwt.PyJWKClient(f"https://{CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs", cache_keys=True)
    if CF_ACCESS_TEAM_DOMAIN
    else None
)

# One DB connection per request: every dependency and the route share it (FastAPI caches it).
Conn = Annotated[Connection, Depends(get_conn)]


@dataclass(frozen=True)
class AdminUser:
    """A signed-in admin, as the admins table has them."""

    email: str
    name: str | None
    role: str  # super_admin, admin or member

    @property
    def is_member(self) -> bool:
        """A committee member: no managing admins, and announcements as drafts only."""
        return self.role == "member"


def _dev_email(token: str) -> str | None:
    """DEV ONLY: "dev" -> DEV_AUTH_EMAIL, "dev:<email>" -> that email. None when dev mode is off."""
    if not DEV_AUTH_EMAIL:
        return None
    if token == "dev":
        return DEV_AUTH_EMAIL
    if token.startswith("dev:") and "@" in token:
        return token[4:].strip().lower()
    return None


def verify_access_token(token: str) -> str:
    """Checks the Cloudflare Access JWT: signature, audience, issuer and expiry. Returns the lowercased email.
    Verified here too (not only trusted), so a request that reaches us without Cloudflare cannot forge it."""
    if _jwks_client is None or CF_ACCESS_AUD is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "cloudflare access is not configured")
    try:
        key = _jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=CF_ACCESS_AUD,
            issuer=f"https://{CF_ACCESS_TEAM_DOMAIN}",
            leeway=CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iat", "aud", "iss", "email"]},
        )
    except PyJWKClientConnectionError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "sign-in keys unavailable") from None
    except (PyJWKClientError, InvalidTokenError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token") from None
    email = str(claims["email"]).strip().lower()
    if "@" not in email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    return email


def require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    conn: Conn,
    access_token: Annotated[str | None, Header(alias=ACCESS_HEADER)] = None,
) -> AdminUser:
    """Expects the Cloudflare Access header from an email listed in admins (or a dev token in dev)."""
    email = _dev_email(credentials.credentials) if credentials and credentials.credentials else None
    if email is None:
        if not access_token:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing access token")
        email = verify_access_token(access_token)
    row = admins.find(conn, email)
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not an admin")
    return AdminUser(email=email, name=row["name"], role=row["role"])


Admin = Annotated[AdminUser, Depends(require_admin)]


def require_manager(user: Admin) -> AdminUser:
    """An admin or a super admin: managing admins, publishing and pinning. Not a committee member."""
    if user.is_member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "requires an admin")
    return user


Manager = Annotated[AdminUser, Depends(require_manager)]


@contextmanager
def http_errors(errors: dict[type[Exception], tuple[int, str | None]]) -> Iterator[None]:
    """Turns a service's exceptions into HTTP errors, so a route needs no try/except of its own:

        with http_errors(_ERRORS):
            return inquiries.get(conn, inquiry_id)

    errors maps an exception class to (status code, detail); a None detail uses the exception's
    own message. Any other exception passes through.
    """
    try:
        yield
    except tuple(errors) as exc:
        status_code, detail = next(v for cls, v in errors.items() if isinstance(exc, cls))
        raise HTTPException(status_code, detail or str(exc)) from None
    