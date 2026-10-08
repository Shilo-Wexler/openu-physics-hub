"""Verifies Google ID tokens sent by the browser after Google sign-in."""

import asyncio

import jwt

from app.core import settings

# Google's public signing keys. PyJWKClient caches them in memory,
# so most verifications are a local signature check with no network call.
_GOOGLE_KEYS = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", lifespan=3600)
_GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"]


class InvalidGoogleToken(Exception):
    pass


def _verify(token: str) -> str:
    key = _GOOGLE_KEYS.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        key.key,
        algorithms=["RS256"],
        audience=settings.GOOGLE_CLIENT_ID,
        issuer=_GOOGLE_ISSUERS,
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )
    return claims["sub"]


async def verify_id_token(token: str) -> str:
    """Return the Google user id (sub) of a valid token, or raise InvalidGoogleToken."""
    try:
        # Runs in a thread: fetching keys is a blocking network call when the cache is empty.
        return await asyncio.to_thread(_verify, token)
    except jwt.PyJWKClientConnectionError:
        # Google is unreachable: a server problem, not a bad token.
        raise
    except jwt.PyJWTError as exc:
        raise InvalidGoogleToken(str(exc)) from exc