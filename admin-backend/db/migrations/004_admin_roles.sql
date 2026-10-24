-- Admin levels and names.
-- Every admin has exactly one level, and every level sees every area of the console:
--   super_admin  everything, including adding, changing and removing any admin
--   admin        everything, including managing admins and members, but never a super admin
--   member       inquiries and chat moderation; announcements as drafts only; cannot manage admins
-- An admin added by hand in the DB (the first one) is a super admin by default.
-- The name is what the console shows instead of the email ("handled by", "written by", the chat log).
-- Cloudflare Access sends no name, so it is kept here. An admin added by hand needs one too.
alter table admins
  add column role text not null default 'super_admin'
    check (role in ('super_admin', 'admin', 'member')),
  add column name text not null
    check (char_length(name) between 2 and 40);