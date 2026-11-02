"""Keeps the console's Cloudflare Access rule group equal to the admins table.

The admins table decides who may use the console (checked on every request). Cloudflare Access sits
in front of the console and lets in only the emails in one rule group. This module copies the table's
emails into that group, so adding or removing someone in the console is enough and nobody edits the
group by hand. The table stays the source of truth: every sync writes the whole list, so a sync that
failed is fixed by the next one (after the next change, or by the jobs/sync_access.py CronJob).

Off when CF_API_TOKEN, CF_ACCOUNT_ID and CF_ACCESS_GROUP_ID are not set (local dev).
"""

import logging

import requests
from psycopg import Connection

from app.core import settings
from app.core.db import pool

API_URL = "https://api.cloudflare.com/client/v4"
TIMEOUT_SECONDS = 10
# Any fixed number, the same in every pod and in the CronJob: syncs wait for each other on it,
# so two syncs never read the table in one order and write the group in the other.
LOCK_KEY = 7_202_611

log = logging.getLogger("uvicorn.error")


class SyncError(Exception):
    """The group could not be read or written. str() is safe to log: it never holds the token."""


def _group_url() -> str:
    return f"{API_URL}/accounts/{settings.CF_ACCOUNT_ID}/access/groups/{settings.CF_ACCESS_GROUP_ID}"


def _call(method: str, body: dict | None = None) -> dict:
    """One call to the group's API. Returns the group (Cloudflare's "result")."""
    try:
        response = requests.request(
            method,
            _group_url(),
            headers={"Authorization": f"Bearer {settings.CF_API_TOKEN}"},
            json=body,
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        raise SyncError(f"Cloudflare unreachable: {type(e).__name__}") from None

    try:
        answer = response.json()
    except ValueError:
        answer = {}
    if response.status_code >= 400 or not answer.get("success"):
        # Cloudflare's own codes, e.g. a token used from an IP address it does not allow.
        errors = "; ".join(f"{e.get('code')}: {e.get('message')}" for e in answer.get("errors") or [])
        raise SyncError(f"Cloudflare {method} failed with {response.status_code}: {errors or 'no details'}")
    return answer["result"]


def _admin_emails(conn: Connection) -> list[str]:
    rows = conn.execute("select email from admins").fetchall()
    return sorted({row["email"].strip().lower() for row in rows})


def sync(conn: Connection) -> bool:
    """Makes the group's emails equal to the admins table. True when the group had to change.

    Raises SyncError. Holds a lock until conn's transaction ends, so run it in a transaction of its own.
    """
    conn.execute("select pg_advisory_xact_lock(%s)", (LOCK_KEY,))
    wanted = _admin_emails(conn)
    if not wanted:
        # Cloudflare refuses a group with no rules, and a console with nobody in it is surely a mistake.
        raise SyncError("the admins table is empty, so the group was left as it is")

    group = _call("GET")
    include = group.get("include") or []
    current = {rule["email"]["email"].lower() for rule in include if "email" in rule}
    # Equal sets and no other kind of rule (e.g. one added by hand in the dashboard): nothing to do.
    if current == set(wanted) and len(include) == len(current):
        return False

    _call(
        "PUT",
        {
            "name": group["name"],
            "include": [{"email": {"email": email}} for email in wanted],
            "exclude": group.get("exclude") or [],
            "require": group.get("require") or [],
        },
    )
    log.info(
        "access sync: group updated, added %s, removed %s",
        sorted(set(wanted) - current),
        sorted(current - set(wanted)),
    )
    return True


def sync_in_background() -> None:
    """Runs after a change to the admins table (FastAPI BackgroundTasks). Never raises: the change is
    already saved, so a failure is only logged and the CronJob fixes the group later."""
    if not settings.ACCESS_SYNC_ENABLED:
        return
    try:
        with pool.connection() as conn:
            sync(conn)
    except SyncError as e:
        log.error("access sync failed: %s", e)
    except Exception:
        log.exception("access sync failed")