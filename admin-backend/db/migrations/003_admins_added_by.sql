-- Admins can now add other admins from the console: remember who added whom.
-- Null for admins added directly in the DB (the first one, or by hand).
alter table admins
  add column added_by text check (added_by is null or added_by = lower(trim(added_by)));
