"""Google ID token verification and the admin check."""

from collections.abc import Callable
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from psycopg import Connection

from .config import DEV_AUTH_EMAIL, GOOGLE_CLIENT_ID
from .db import get_conn

_transport = google_requests.Request()
# Adds the "Authorize" button in /docs. auto_error=False so we return our own 401.
_bearer = HTTPBearer(auto_error=False)


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


# SHARED: used by the admin check (require_admin) and by the STUDENT-SIDE submission.
def verify_google_token(token: str) -> GoogleUser:
    """Checks signature, audience, issuer and expiry. Returns the verified, lowercased email."""
    dev = _dev_user(token)
    if dev is not None:
        return dev
    try:
        claims = id_token.verify_oauth2_token(
            token, _transport, GOOGLE_CLIENT_ID, clock_skew_in_seconds=10
        )
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "email not verified")
    return GoogleUser(email=claims["email"].strip().lower(), name=claims.get("name"))


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    conn: Connection = Depends(get_conn),
) -> GoogleUser:
    """Expects 'Authorization: Bearer <google id token>' from an email listed in admins."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    user = verify_google_token(credentials.credentials)
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
