"""Copies daily visits to the public site from Cloudflare into the site_visits table.

Cloudflare keeps the numbers for 31 days only, so this runs every hour (a Kubernetes CronJob) and the
console's stats read the table. See services/visits.py for what is counted and how days are rewritten.
Run: python -m app.jobs.sync_visits
Exits 1 on failure, so the failed Job shows in kubectl.
"""

import logging
import sys

import psycopg
from psycopg.rows import dict_row

from app.core import settings
from app.services import visits

log = logging.getLogger("uvicorn.error")


def main() -> int:
    # No uvicorn here to set up logging, so print INFO and up to stderr ourselves.
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if not settings.VISITS_SYNC_ENABLED:
        log.error("visits sync is not configured: set CF_ANALYTICS_TOKEN, CF_ZONE_ID and VISITS_HOSTS")
        return 1
    try:
        # The connection commits when the block ends without an error, so a failed run saves nothing.
        with psycopg.connect(settings.DATABASE_URL, row_factory=dict_row) as conn:
            days = visits.sync(conn)
    except visits.SyncError as e:
        log.error("visits sync failed: %s", e)
        return 1
    log.info("visits sync: %s days written", days)
    return 0


if __name__ == "__main__":
    sys.exit(main())