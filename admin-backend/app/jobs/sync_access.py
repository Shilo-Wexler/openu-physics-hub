"""Reconcile job: makes the console's Cloudflare Access group equal to the admins table.

Every add or remove in the console already syncs the group (services/access_sync.py). This job catches
a sync that failed or was lost: Cloudflare was down, a pod restarted mid-sync, or someone edited the
group by hand. Run by a Kubernetes CronJob: python -m app.jobs.sync_access
Exits 1 on failure, so the failed Job shows in kubectl.
"""

import logging
import sys

import psycopg
from psycopg.rows import dict_row

from app.core import settings
from app.services import access_sync

log = logging.getLogger("uvicorn.error")


def main() -> int:
    # No uvicorn here to set up logging, so print INFO and up to stderr ourselves.
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if not settings.ACCESS_SYNC_ENABLED:
        log.error("access sync is not configured: set CF_API_TOKEN, CF_ACCOUNT_ID and CF_ACCESS_GROUP_ID")
        return 1
    try:
        with psycopg.connect(settings.DATABASE_URL, row_factory=dict_row) as conn:
            changed = access_sync.sync(conn)
    except access_sync.SyncError as e:
        log.error("access sync failed: %s", e)
        return 1
    log.info("access sync: %s", "group updated" if changed else "already in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())