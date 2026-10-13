-- Admin DB initial schema: student requests to the physics student committee.
-- Separate database from the chat DB. Token verification, rate limiting and
-- all permission checks live in the backend; the DB enforces shapes and states.
-- Run with psql from the admin-backend folder, so the \copy below finds ../shared/courses.csv:
--   psql -d <admin_db> -f db/migrations/001_init.sql

-- Courses. Requests reference the course by its name.
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

-- Admins allowed into the admin page (matched by their Google email).
create table admins (
  email      text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

-- Requests. SHARED: STUDENT-SIDE inserts them (POST /api/requests); the admin console reads and changes them.
-- Students can only create them; they never read, edit or delete.
-- email is the verified Google email, stored lowercase, and is used to detect spam.
-- A request can be closed only after an admin has opened it.
create table requests (
  id          bigint generated always as identity primary key,
  full_name   text not null check (length(trim(full_name)) between 1 and 100),
  email       text not null check (email = lower(trim(email)) and length(email) <= 254
                                   and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  course_name text not null references courses (name) on update cascade,
  body        text not null check (length(trim(body)) between 1 and 5000),
  status      text not null default 'new' check (status in ('new', 'closed')),
  is_opened   boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint requests_closed_only_after_opened check (status = 'new' or is_opened)
);

-- Spam checks: recent requests per sender.
create index requests_email_idx on requests (email, created_at desc);
-- Admin queue: unopened / open requests, oldest first.
create index requests_status_idx on requests (status, is_opened, created_at);

-- Blocked senders, by email. Managed from the console; enforced on the STUDENT-SIDE (trigger below).
create table blocked_emails (
  email      text primary key check (email = lower(trim(email))),
  reason     text check (length(reason) <= 255),
  blocked_at timestamptz not null default now()
);

-- STUDENT-SIDE: blocked senders cannot create requests.
create function reject_blocked_email()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from blocked_emails where email = new.email) then
    raise exception 'sender is blocked';
  end if;
  return new;
end;
$$;

create trigger requests_reject_blocked before insert on requests
  for each row execute function reject_blocked_email();
