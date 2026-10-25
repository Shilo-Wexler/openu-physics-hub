-- Admin levels and names.
-- Every admin has exactly one level, and every level sees every area of the console:
--   admin        everything, including adding, changing and removing anyone
--   committee    everything, including managing committee and team, but never an admin
--   team         inquiries and chat moderation; announcements as drafts only; cannot manage others
-- A row added by hand in the DB (the first one) is an admin by default.
-- The name is what the console shows instead of the email ("handled by", "written by", the chat log).
-- Cloudflare Access sends no name, so it is kept here. An admin added by hand needs one too.
alter table admins
  add column role text not null default 'admin'
    check (role in ('admin', 'committee', 'team')),
  add column name text not null
    check (char_length(name) between 2 and 40);