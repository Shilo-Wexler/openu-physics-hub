"""Copies daily visits to the public site from Cloudflare's analytics into the site_visits table.

Cloudflare sits in front of the site and counts every request. A "visit" here is Cloudflare's own
visits metric on the public site's hosts (settings.VISITS_HOSTS): a page load that came from outside
the site (a search result, a link in a chat group, a typed address), not a reload or a move between
the site's pages. Files, API calls and the console are not counted. Bots that load pages are, since
the free plan cannot tell them apart.

Cloudflare keeps these numbers for 31 days only, so the jobs/sync_visits.py CronJob copies them every
hour and the console reads the table, never Cloudflare. The table stays correct by rewriting whole days:
every run rewrites the last day it has (today's number grows, yesterday's is completed after midnight)
and fills any days it missed while it was not running, as far back as Cloudflare still has them.

Off when CF_ANALYTICS_TOKEN, CF_ZONE_ID and VISITS_HOSTS are not set (local dev).
"""

import logging
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import requests
from psycopg import Connection

from app.core import settings

GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql"
TIMEOUT_SECONDS = 20
# Days in the table are calendar days in Israel, the way the console shows dates.
SITE_TIMEZONE = ZoneInfo("Asia/Jerusalem")
# The free plan answers for the last 31 days. Today plus 29 full days before it stays inside that.
MAX_DAYS_BACK = 29
# Above this sampling the day's number is only an estimate, and the log says so.
# A day that is counted in full comes back as 1.00 and a bit, so not exactly 1.
SAMPLED_ABOVE = 1.05

# Visits (entries from outside the site) on the site's HTML pages in one time range, as a single total.
# One query per day, never one long range: over a long range Cloudflare counts only a sample
# (e.g. 1 request in 10) and multiplies, so every number came out a multiple of 10.
# sampleInterval says how much it sampled (1 = every request counted).
_QUERY = """
query ($zone: String!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
  viewer {
    zones(filter: {zoneTag: $zone}) {
      httpRequestsAdaptiveGroups(limit: 1, filter: $filter) {
        sum { visits }
        avg { sampleInterval }
      }
    }
  }
}
"""

_UPSERT = """
    insert into site_visits (day, visits) values (%s, %s)
    on conflict (day) do update set visits = excluded.visits, updated_at = now()
"""

log = logging.getLogger("uvicorn.error")


class SyncError(Exception):
    """Cloudflare could not be read. str() is safe to log: it never holds the token."""


def _utc_text(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _day_start(day: date) -> datetime:
    """Midnight at the start of `day` in Israel."""
    return datetime.combine(day, time(0), tzinfo=SITE_TIMEZONE)


def _count(start: datetime, end: datetime) -> int:
    """Visits from `start` to `end`."""
    variables = {
        "zone": settings.CF_ZONE_ID,
        "filter": {
            "datetime_geq": _utc_text(start),
            "datetime_lt": _utc_text(end),
            "edgeResponseContentTypeName": "html",
            "clientRequestHTTPHost_in": settings.VISITS_HOSTS,
        },
    }
    try:
        response = requests.post(
            GRAPHQL_URL,
            headers={"Authorization": f"Bearer {settings.CF_ANALYTICS_TOKEN}"},
            json={"query": _QUERY, "variables": variables},
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        raise SyncError(f"Cloudflare unreachable: {type(e).__name__}") from None

    try:
        answer = response.json()
    except ValueError:
        answer = {}
    errors = answer.get("errors") or []
    if response.status_code >= 400 or errors or not answer.get("data"):
        details = "; ".join(str(e.get("message")) for e in errors)
        raise SyncError(f"Cloudflare query failed with {response.status_code}: {details or 'no details'}")

    zones = answer["data"]["viewer"]["zones"]
    if not zones:
        raise SyncError("zone not found: check CF_ZONE_ID and the token's zone")
    rows = zones[0]["httpRequestsAdaptiveGroups"]
    if not rows:
        return 0
    sample_interval = rows[0]["avg"]["sampleInterval"]
    if sample_interval > SAMPLED_ABOVE:
        log.warning("visits sync: Cloudflare sampled %s (interval %.2f), the number is an estimate",
                    start.date(), sample_interval)
    return rows[0]["sum"]["visits"]


def sync(conn: Connection) -> int:
    """Rewrites the days from the last one in the table (or from 29 days ago when the table is empty
    or older than that) up to today. Returns how many days were written. Raises SyncError."""
    now = datetime.now(UTC)
    today = now.astimezone(SITE_TIMEZONE).date()
    oldest = today - timedelta(days=MAX_DAYS_BACK)
    last = conn.execute("select max(day) as last from site_visits").fetchone()["last"]
    # At least yesterday, so a day is completed after midnight even when today's row exists already.
    first = oldest if last is None else max(oldest, min(last, today - timedelta(days=1)))

    # Every day in the range gets a row, so a day with no visits is saved as 0, not left out.
    # Today ends now, not at midnight: Cloudflare refuses ranges that reach into the future.
    visits = {}
    day = first
    while day <= today:
        end = now if day == today else _day_start(day + timedelta(days=1))
        visits[day] = _count(_day_start(day), end)
        day += timedelta(days=1)

    with conn.cursor() as cur:
        cur.executemany(_UPSERT, list(visits.items()))
    log.info("visits sync: %s to %s, %s visits", first, today, sum(visits.values()))
    return len(visits)
