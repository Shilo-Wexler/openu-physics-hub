-- Admin DB initial schema: courses and console admins. Later files add roles (004),
-- announcements (005) and anonymous inquiries (006).
-- Separate database from the chat DB. Token verification, rate limiting and
-- all permission checks live in the backend; the DB enforces shapes and states.

-- Courses. Inquiries (006) reference a course by its course_number.
-- course_number is 0 for the "general" row (כללי).
-- The rows come from shared/courses.csv and are loaded by db/seed/courses.sql on every deploy.
create table courses (
  name          text primary key check (length(trim(name)) between 1 and 100),
  course_number integer not null unique,
  is_active     boolean not null default true
);

-- Admins allowed into the console, matched by the email Cloudflare Access signs in with.
create table admins (
  email      text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);
