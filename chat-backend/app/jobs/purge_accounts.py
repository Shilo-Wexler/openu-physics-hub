"""Daily job: delete the accounts whose deletion was asked for at least a week ago.

Runs as a Kubernetes CronJob from the chat backend image, with the same settings as the server:
    python -m app.jobs.purge_accounts
Safe to run any number of times: an account is deleted once, and a run with nothing due does nothing.
"""

import asyncio

from app.core import db
from app.services import users


async def main() -> None:
    await db.open_pool()
    try:
        purged = await users.purge_due()
    finally:
        await db.close_pool()
    # One line per run, for kubectl logs.
    print(f"purged {purged} accounts")


if __name__ == "__main__":
    asyncio.run(main())