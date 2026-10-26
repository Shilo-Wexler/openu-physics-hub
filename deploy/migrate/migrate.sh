#!/bin/sh
# Brings one database up to date: applies new migrations in order, then loads the courses.
# Connection comes from the standard Postgres env vars: PGHOST, PGDATABASE, PGUSER, PGPASSWORD.
# Safe to run on every deploy: applied migrations are skipped and the seed is an upsert.
set -eu

export PGOPTIONS="-c client_min_messages=warning"

MIGRATIONS_DIR=/db/migrations
SEED_FILE=/db/seed/courses.sql
COURSES_CSV=/db/courses.csv

run_psql() {
  psql -X -q -v ON_ERROR_STOP=1 "$@"
}

echo "Waiting for $PGHOST..."
until pg_isready -q; do
  sleep 2
done

run_psql -c "create table if not exists schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
)"

for file in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$file")
  applied=$(run_psql -tA -v name="$name" <<'SQL'
select 1 from schema_migrations where filename = :'name';
SQL
  )
  if [ -n "$applied" ]; then
    echo "Skip  $name"
    continue
  fi
  echo "Apply $name"
  # One transaction for the file and its record: a failed migration leaves no trace.
  run_psql --single-transaction -v name="$name" -f "$file" -f - <<'SQL'
insert into schema_migrations (filename) values (:'name');
SQL
done

echo "Seed  courses"
run_psql -f "$SEED_FILE" < "$COURSES_CSV"

echo "Done"