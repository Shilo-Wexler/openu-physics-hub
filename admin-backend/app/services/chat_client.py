"""Calls to the chat backend's /internal moderation API (chat-backend/docs/internal-api.md).

Server to server only: the browser talks to /api/admin/chat/*, never to the chat backend.
Errors become HTTPExceptions the admin routes can pass straight on.
"""

import logging
from typing import Any

import requests
from fastapi import HTTPException, status

from app.core import settings

log = logging.getLogger("uvicorn.error")


def _send(method: str, url: str, headers: dict, timeout: float) -> requests.Response:
    """The one network call. Tests replace this function."""
    return requests.request(method, url, headers=headers, timeout=timeout)


def call(method: str, path: str) -> Any:
    """method + "/internal" + path on the chat backend. Returns the parsed JSON."""
    if not (settings.CHAT_API_URL and settings.MOD_API_TOKEN):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "chat moderation is not configured")

    try:
        response = _send(
            method,
            f"{settings.CHAT_API_URL}/internal{path}",
            headers={"Authorization": f"Bearer {settings.MOD_API_TOKEN}"},
            timeout=settings.CHAT_TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        log.warning("chat backend unreachable: %s", type(e).__name__)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "chat backend unavailable")

    if response.status_code == 401:
        # Our token is wrong: a configuration problem, not the admin's fault. Never log the token.
        log.error("chat backend rejected MOD_API_TOKEN")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "chat backend rejected the moderation token")
    # 409: an undo with nothing left to undo (the message was handled again since).
    if response.status_code in (404, 409, 422):
        raise HTTPException(response.status_code, _detail(response))
    if response.status_code >= 400:
        log.error("chat backend error %s on %s %s", response.status_code, method, path)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"chat backend error {response.status_code}")
    return response.json()


def _detail(response: requests.Response) -> str:
    try:
        detail = response.json().get("detail")
        if isinstance(detail, str):
            return detail
    except ValueError:
        pass
    return "chat backend error"
