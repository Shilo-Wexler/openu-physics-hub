-- Admin roles, following the roles agreed with the chat side:
--   admin          everything, including adding, changing and removing admins
--   inquiries      the anonymous inquiries from the site's form
--   moderator      chat moderation
--   announcements  committee announcements
-- The console offers two levels: "מנהל ראשי" = {admin}, and "מנהל" = {inquiries, moderator, announcements},
-- which is everything except managing admins. Existing admins (and one added by hand) default to {admin}.
alter table admins
  add column roles text[] not null default array['admin']
    check (cardinality(roles) > 0
           and roles <@ array['admin', 'moderator', 'inquiries', 'announcements']::text[]);
