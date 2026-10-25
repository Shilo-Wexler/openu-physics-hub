"""Daily job: delete the accounts whose deletion was asked for at least a week ago,
and the expired sessions of browsers that never came back.

Runs as a Kubernetes CronJob from the chat backend image, with the same settings as the server:
    python -m app.jobs.purge_accounts
Safe to run any number of times: each run deletes only what is due, and a run with nothing
due does nothing.
"""

import asyncio

from app.core import db
from app.services import sessions, users


async def main() -> None:
    await db.open_pool()
    try:
        purged = await users.purge_due()
        expired = await sessions.purge_expired()
    finally:
        await db.close_pool()
    # One line per run, for kubectl logs.
    print(f"purged {purged} accounts, {expired} expired sessions")


if __name__ == "__main__":
    asyncio.run(main())
    