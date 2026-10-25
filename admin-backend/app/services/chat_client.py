"""Calls to the chat backend's /internal moderation API (chat-backend/docs/internal-api.md).

Server to server only: the browser talks to /api/admin/chat/*, never to the chat backend.
Every failure is a ChatError whose message is safe to show to an admin.
"""

import logging
from typing import Any

import requests

from app.core import settings

TIMEOUT_SECONDS = 5

log = logging.getLogger("uvicorn.error")


class ChatError(Exception):
    """The call gave no result. str() is the reason, safe to show."""


class NotConfigured(ChatError):
    """CHAT_API_URL or MOD_API_TOKEN is not set."""


class Unavailable(ChatError):
    """The chat backend is down, rejected our token, or failed."""


class Refused(ChatError):
    """The chat backend answered 404, 409 or 422 with a reason, which the console should see as is."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code


def _send(method: str, url: str, headers: dict, timeout: float) -> requests.Response:
    """The one network call."""
    return requests.request(method, url, headers=headers, timeout=timeout)


def call(method: str, path: str) -> Any:
    """method + "/internal" + path on the chat backend. Returns the parsed JSON."""
    if not (settings.CHAT_API_URL and settings.MOD_API_TOKEN):
        raise NotConfigured("chat moderation is not configured")

    try:
        response = _send(
            method,
            f"{settings.CHAT_API_URL}/internal{path}",
            headers={"Authorization": f"Bearer {settings.MOD_API_TOKEN}"},
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        log.warning("chat backend unreachable: %s", type(e).__name__)
        raise Unavailable("chat backend unavailable") from None

    if response.status_code == 401:
        # Our token is wrong: a configuration problem, not the admin's fault. Never log the token.
        log.error("chat backend rejected MOD_API_TOKEN")
        raise Unavailable("chat backend rejected the moderation token")
    # 409: an undo with nothing left to undo (the message was handled again since).
    if response.status_code in (404, 409, 422):
        raise Refused(response.status_code, _detail(response))
    if response.status_code >= 400:
        log.error("chat backend error %s on %s %s", response.status_code, method, path)
        raise Unavailable(f"chat backend error {response.status_code}")
    return response.json()


def _detail(response: requests.Response) -> str:
    try:
        detail = response.json().get("detail")
        if isinstance(detail, str):
            return detail
    except ValueError:
        pass
    return "chat backend error"
