"""Connection pool. Each request gets one connection; it commits on success and rolls back on error."""

from collections.abc import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.core.settings import DATABASE_URL

# The console and the public routes (inquiries, announcements) share this pool.
# MAX_SIZE keeps one busy moment from opening more connections than Postgres allows.
MIN_SIZE = 2
MAX_SIZE = 10
# Seconds a request waits for a free connection before it fails with 503 (see main.py).
WAIT_TIMEOUT = 5

# Times (e.g. weekly buckets) are computed in Israel time.
# check: each connection is tested before a request gets it, so connections left dead by a
# Postgres restart are replaced instead of failing the request.
pool = ConnectionPool(
    DATABASE_URL,
    open=False,
    min_size=MIN_SIZE,
    max_size=MAX_SIZE,
    timeout=WAIT_TIMEOUT,
    check=ConnectionPool.check_connection,
    kwargs={"row_factory": dict_row, "options": "-c timezone=Asia/Jerusalem"},
)


def get_conn() -> Iterator[Connection]:
    with pool.connection() as conn:
        yield conn
        