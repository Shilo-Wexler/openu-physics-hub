"""Cloudflare Turnstile: checks the anti-bot token that the public inquiry form sends.

One call to Cloudflare's siteverify per inquiry, see
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
"""

import logging

import requests

from app.core.settings import TURNSTILE_SECRET

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT_SECONDS = 5

# Error codes that mean our side is misconfigured (wrong or missing secret), not that the visitor is a bot.
SERVER_SIDE_ERRORS = {"missing-input-secret", "invalid-input-secret"}

log = logging.getLogger("uvicorn.error")


class Unavailable(Exception):
    """The check cannot be made, so the inquiry must not be accepted. The message is safe to show."""


class Rejected(Exception):
    """Cloudflare rejected the token: a bot, or an expired or reused token."""


def _send(secret: str, token: str) -> dict:
    """The only network call."""
    response = requests.post(
        VERIFY_URL,
        data={"secret": secret, "response": token},
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def verify(token: str) -> None:
    """Returns when Cloudflare accepts the token. Fails closed: when in doubt, Unavailable."""
    if TURNSTILE_SECRET is None:
        raise Unavailable("inquiries are not configured")

    try:
        result = _send(TURNSTILE_SECRET, token)
    except (requests.RequestException, ValueError) as exc:
        log.warning("turnstile check unavailable: %s", exc)
        raise Unavailable("verification unavailable, try again later") from exc

    if result.get("success") is True:
        return

    codes = set(result.get("error-codes") or [])
    if codes & SERVER_SIDE_ERRORS:
        log.error("turnstile secret rejected by Cloudflare: %s", sorted(codes))
        raise Unavailable("verification unavailable, try again later")
    raise Rejected()
