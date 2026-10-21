"""Console sign-in (Cloudflare Access JWT), the old student Google ID token check, and the admin check."""

from collections.abc import Callable
from dataclasses import dataclass, field

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jwt.exceptions import InvalidTokenError, PyJWKClientConnectionError, PyJWKClientError
from psycopg import Connection

from .config import CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN, DEV_AUTH_EMAIL, GOOGLE_CLIENT_ID
from .db import get_conn

_transport = google_requests.Request()
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


@dataclass
class GoogleUser:
    email: str
    name: str | None
    roles: list[str] = field(default_factory=list)  # filled in by require_admin

    @property
    def is_full_admin(self) -> bool:
        return "admin" in self.roles


def _dev_user(token: str) -> GoogleUser | None:
    """DEV ONLY: "dev" -> DEV_AUTH_EMAIL, "dev:<email>" -> that email. None when dev mode is off."""
    if not DEV_AUTH_EMAIL:
        return None
    if token == "dev":
        return GoogleUser(email=DEV_AUTH_EMAIL, name="Dev Admin")
    if token.startswith("dev:") and "@" in token:
        return GoogleUser(email=token[4:].strip().lower(), name="Dev User")
    return None


# STUDENT-SIDE: the old POST /api/requests. The console no longer signs in with Google.
def verify_google_token(token: str) -> GoogleUser:
    """Checks signature, audience, issuer and expiry. Returns the verified, lowercased email."""
    dev = _dev_user(token)
    if dev is not None:
        return dev
    try:
        claims = id_token.verify_oauth2_token(
            token, _transport, GOOGLE_CLIENT_ID, clock_skew_in_seconds=CLOCK_SKEW_SECONDS
        )
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "email not verified")
    return GoogleUser(email=claims["email"].strip().lower(), name=claims.get("name"))


def verify_access_token(token: str) -> GoogleUser:
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
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "sign-in keys unavailable")
    except (PyJWKClientError, InvalidTokenError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    email = str(claims["email"]).strip().lower()
    if "@" not in email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    return GoogleUser(email=email, name=None)


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    access_token: str | None = Header(None, alias=ACCESS_HEADER),
    conn: Connection = Depends(get_conn),
) -> GoogleUser:
    """Expects the Cloudflare Access header from an email listed in admins (or a dev token in dev)."""
    user = _dev_user(credentials.credentials) if credentials and credentials.credentials else None
    if user is None:
        if not access_token:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing access token")
        user = verify_access_token(access_token)
    row = conn.execute("select roles from admins where email = %s", (user.email,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not an admin")
    user.roles = list(row["roles"])
    return user


def require_full_admin(user: GoogleUser = Depends(require_admin)) -> GoogleUser:
    """Only the "admin" role may add, change or remove admins."""
    if not user.is_full_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "requires the admin role")
    return user


def require_role(role: str) -> Callable[..., GoogleUser]:
    """A dependency for one area of the console: an admin with that role, or a full admin
    (who may do everything). Usage: user: GoogleUser = Depends(require_role("announcements"))."""

    def check(user: GoogleUser = Depends(require_admin)) -> GoogleUser:
        if not user.is_full_admin and role not in user.roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"requires the {role} role")
        return user

    return check
