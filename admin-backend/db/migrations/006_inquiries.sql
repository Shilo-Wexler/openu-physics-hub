-- Inquiries from the public site's anonymous form (POST /api/inquiries).
-- Anonymous by design: no name, email, IP or any other identity is stored.
-- The backend checks Turnstile and the honeypot; the DB enforces shapes and states.

create table inquiries (
  id            bigint generated always as identity primary key,
  course_number integer not null references courses (course_number),
  type          text not null check (type in ('exams', 'staff', 'accessibility', 'admin', 'other')),
  content       text not null check (length(trim(content)) between 1 and 2000),
  status        text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  -- Console-only handling fields. handled_by is an admin's email, kept as plain text (no foreign key)
  -- so the history stays when that admin is removed from the admins table.
  handled_by    text check (handled_by = lower(trim(handled_by))),
  internal_note text check (length(internal_note) <= 2000),
  created_at    timestamptz not null default now(),
  -- Set by the backend on every console change (business logic stays in Python, no trigger).
  updated_at    timestamptz not null default now()
);

-- Console list: filter by status, newest first, paged with ?before=<id>.
-- The "all statuses" view uses the primary key instead.
create index inquiries_status_id_idx on inquiries (status, id desc);