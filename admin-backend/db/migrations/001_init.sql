-- Admin DB initial schema: courses and console admins. Later files add roles (004),
-- announcements (005) and anonymous inquiries (006).
-- Separate database from the chat DB. Token verification, rate limiting and
-- all permission checks live in the backend; the DB enforces shapes and states.
-- Run with psql from the admin-backend folder, so the \copy below finds ../shared/courses.csv:
--   psql -d <admin_db> -f db/migrations/001_init.sql

-- Courses. Inquiries (006) reference a course by its course_number.
-- course_number is 0 for the "general" row (כללי).
create table courses (
  name          text primary key check (length(trim(name)) between 1 and 100),
  course_number integer unique,
  is_active     boolean not null default true
);

-- Course list from the shared file (columns: course_id, name). Read only, never written.
\copy courses (course_number, name) from '../shared/courses.csv' with (format csv, header, encoding 'UTF8')

-- "General" (כללי) is row 0 in shared/courses.csv; the chat uses it too. Also inserted here so the schema
-- still works with an older CSV without that row. Does nothing when the CSV already has it.
insert into courses (name, course_number) values ('כללי', 0) on conflict do nothing;

-- Admins allowed into the console, matched by the email Cloudflare Access signs in with.
create table admins (
  email      text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);
