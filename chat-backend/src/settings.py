"""Settings read from environment variables. Nothing is hardcoded."""

import os


def _secret(name: str) -> str:
    """Read a required secret from the file named in NAME_FILE, or else from NAME."""
    path = os.environ.get(f"{name}_FILE")
    if path:
        with open(path) as f:
            value = f.read().strip()
    else:
        value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"missing required setting: set {name} or {name}_FILE")
    return value


# Postgres connection string, e.g. postgresql://user:password@host:5432/dbname
DATABASE_URL = _secret("DATABASE_URL")

# Upper limit of open DB connections per server process.
DB_POOL_MAX = int(os.environ.get("DB_POOL_MAX", "10"))

# Seconds a readiness check may wait for the DB before reporting not ready.
READY_TIMEOUT = float(os.environ.get("READY_TIMEOUT", "2"))