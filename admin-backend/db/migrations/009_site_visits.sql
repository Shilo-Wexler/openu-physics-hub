-- Visits to the public site per day, copied from Cloudflare's analytics by the
-- jobs/sync_visits.py CronJob. Cloudflare keeps these numbers for only 31 days,
-- so this table is what lets the console's stats show more than a month back.
-- day is a calendar day in Israel time (not UTC), the way the console shows dates.
-- visits counts HTML page loads on the public site's hosts: the first load of the site
-- in a tab, not moves between pages inside it (the site is a single-page app).
-- The job rewrites the last two days every run, so today's number keeps growing
-- and yesterday's is completed after midnight.

create table site_visits (
  day        date primary key,
  visits     integer not null check (visits >= 0),
  updated_at timestamptz not null default now()
);