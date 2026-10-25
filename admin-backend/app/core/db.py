"""Connection pool. Each request gets one connection; it commits on success and rolls back on error."""

from collections.abc import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.core.settings import DATABASE_URL

# Times (e.g. weekly buckets) are computed in Israel time.
pool = ConnectionPool(
    DATABASE_URL,
    open=False,
    kwargs={"row_factory": dict_row, "options": "-c timezone=Asia/Jerusalem"},
)


def get_conn() -> Iterator[Connection]:
    with pool.connection() as conn:
        yield conn
