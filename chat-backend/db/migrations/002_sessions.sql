-- Login sessions. The browser holds a random token in a cookie; only its
-- SHA-256 hash is stored, so a leaked table cannot be used to log in.
-- Expiry is checked in Python against last_seen_at, so the lifetime is a setting.
create table sessions (
  token_hash   bytea primary key,
  user_id      uuid not null references users (id),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- "Log out from all devices" deletes every session of one user.
create index sessions_user_idx on sessions (user_id);