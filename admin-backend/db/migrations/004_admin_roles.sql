-- Admin levels. Every admin has exactly one, and every level sees every area of the console:
--   super_admin  everything, including adding, changing and removing any admin
--   admin        everything, including managing admins and members, but never a super admin
--   member       inquiries and chat moderation; announcements as drafts only; cannot manage admins
-- An admin added by hand in the DB (the first one) is a super admin by default.
alter table admins
  add column role text not null default 'super_admin'
    check (role in ('super_admin', 'admin', 'member'));