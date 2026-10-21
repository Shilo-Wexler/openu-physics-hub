"""Cloudflare Turnstile: checks the anti-bot token that the public inquiry form sends.

One call to Cloudflare's siteverify per inquiry, see
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
"""

import logging

import requests
from fastapi import HTTPException, status

from .config import TURNSTILE_SECRET

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT_SECONDS = 5

# Error codes that mean our side is misconfigured (wrong or missing secret), not that the visitor is a bot.
SERVER_SIDE_ERRORS = {"missing-input-secret", "invalid-input-secret"}

log = logging.getLogger("uvicorn.error")


def _send(secret: str, token: str) -> dict:
    """The only network call. Tests replace it, so they never reach Cloudflare."""
    response = requests.post(
        VERIFY_URL,
        data={"secret": secret, "response": token},
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def verify(token: str) -> None:
    """Returns when Cloudflare accepts the token.

    422 when the token is rejected (a bot, an expired or reused token).
    503 when the check cannot be made, so an inquiry is never accepted unchecked.
    """
    if TURNSTILE_SECRET is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "inquiries are not configured")

    try:
        result = _send(TURNSTILE_SECRET, token)
    except (requests.RequestException, ValueError) as exc:
        log.warning("turnstile check unavailable: %s", exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "verification unavailable, try again later")

    if result.get("success") is True:
        return

    codes = set(result.get("error-codes") or [])
    if codes & SERVER_SIDE_ERRORS:
        log.error("turnstile secret rejected by Cloudflare: %s", sorted(codes))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "verification unavailable, try again later")
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid turnstile_token")
