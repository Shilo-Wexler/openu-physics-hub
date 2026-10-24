"""Console sign-in (Cloudflare Access JWT) and the admin and level checks."""

from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError, PyJWKClientConnectionError, PyJWKClientError
from psycopg import Connection

from .config import CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN, DEV_AUTH_EMAIL
from .db import get_conn

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
    # Filled in by require_admin from the admins table. Cloudflare sends no name.
    name: str | None = None
    role: str = ""  # filled in by require_admin: super_admin, admin or member

    @property
    def is_super_admin(self) -> bool:
        return self.role == "super_admin"

    @property
    def is_member(self) -> bool:
        """A committee member: no managing admins, and announcements as drafts only."""
        return self.role == "member"


def _dev_user(token: str) -> GoogleUser | None:
    """DEV ONLY: "dev" -> DEV_AUTH_EMAIL, "dev:<email>" -> that email. None when dev mode is off."""
    if not DEV_AUTH_EMAIL:
        return None
    if token == "dev":
        return GoogleUser(email=DEV_AUTH_EMAIL)
    if token.startswith("dev:") and "@" in token:
        return GoogleUser(email=token[4:].strip().lower())
    return None


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
    return GoogleUser(email=email)


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
    row = conn.execute("select role, name from admins where email = %s", (user.email,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not an admin")
    user.role = row["role"]
    user.name = row["name"]
    return user


def require_manager(user: GoogleUser = Depends(require_admin)) -> GoogleUser:
    """An admin or a super admin: managing admins, publishing and pinning. Not a committee member."""
    if user.is_member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "requires an admin")
    return user
