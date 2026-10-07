-- Chat DB initial schema: tables, keys, checks, indexes, the blocked-user trigger
-- and the soft-delete function. All other logic and permission checks live in the Python backend.
-- Course data is loaded separately from db/seed/courses.csv.

-- Users. id is an internal uuid set by the app (not the Google id).
create table users (
  id           uuid primary key,
  nickname     text not null check (length(trim(nickname)) between 3 and 30),
  is_blocked   boolean not null default false,
  is_moderator boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Nicknames are unique regardless of letter case ("Shilo" and "shilo" are the same).
create unique index users_nickname_unique on users (lower(nickname));

-- Login identities. Links a user to an external login provider (Google, later Apple).
-- provider_user_id is the id the provider gives (e.g. the Google id).
create table user_identities (
  user_id          uuid not null references users (id),
  provider         text not null check (provider in ('google', 'apple')),
  provider_user_id text not null,
  created_at       timestamptz not null default now(),
  primary key (provider, provider_user_id)
);

create index user_identities_user_idx on user_identities (user_id);

-- Courses. id is the course number, e.g. 20215.
create table courses (
  id   integer primary key,
  name text not null
);

-- Messages. reply_to_id null = top-level message; otherwise the message being replied to.
-- deleted_at null = active message. Rows are never physically deleted.
-- A reply must be in the same course as the message it replies to.
-- deleted_at and deleted_by are either both set or both null.
create table messages (
  id          bigint generated always as identity primary key,
  course_id   integer not null references courses (id),
  user_id     uuid not null references users (id),
  reply_to_id bigint,
  content     text not null check (length(trim(content)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  deleted_by  uuid references users (id),
  unique (id, course_id),
  constraint messages_deleted_fields_together check ((deleted_at is null) = (deleted_by is null)),
  foreign key (reply_to_id, course_id) references messages (id, course_id)
);

-- Paginated loading of a course's active messages, newest first.
-- id breaks ties between messages with the same created_at.
create index messages_course_idx on messages (course_id, created_at desc, id desc)
  where deleted_at is null;
create index messages_reply_to_idx on messages (reply_to_id);

-- Course ratings: one per user per course.
create table ratings (
  user_id        uuid not null references users (id),
  course_id      integer not null references courses (id),
  difficulty     integer not null check (difficulty between 1 and 5),
  recommendation integer not null check (recommendation between 1 and 5),
  created_at     timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- Average rating per course.
create index ratings_course_idx on ratings (course_id);

-- Likes: one per user per message.
create table likes (
  user_id    uuid not null references users (id),
  message_id bigint not null references messages (id),
  primary key (user_id, message_id)
);

-- Like count per message.
create index likes_message_idx on likes (message_id);

-- Reports on messages. A user can report the same message only once
-- (the app shows a message when reports_one_per_user is violated).
create table reports (
  id          bigint generated always as identity primary key,
  message_id  bigint not null references messages (id),
  reporter_id uuid not null references users (id),
  reason      text not null check (length(trim(reason)) between 1 and 1000),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  constraint reports_one_per_user unique (message_id, reporter_id)
);

-- Blocked users cannot write: rejects new messages, edits, likes, ratings and reports.
-- The trigger argument is the name of the column that holds the acting user's id.
create function reject_blocked_user()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from users
     where id = (to_jsonb(new) ->> tg_argv[0])::uuid and is_blocked
  ) then
    raise exception 'user is blocked';
  end if;
  return new;
end;
$$;

create trigger messages_reject_blocked before insert or update of content on messages
  for each row execute function reject_blocked_user('user_id');
create trigger likes_reject_blocked before insert on likes
  for each row execute function reject_blocked_user('user_id');
create trigger ratings_reject_blocked before insert or update on ratings
  for each row execute function reject_blocked_user('user_id');
create trigger reports_reject_blocked before insert on reports
  for each row execute function reject_blocked_user('reporter_id');

-- Cascading soft delete: marks the message and all its replies, at any depth.
-- Messages already deleted keep their original deleted_at and deleted_by.
-- Returns the number of messages marked.
create function soft_delete_message(p_message_id bigint, p_deleted_by uuid)
returns integer
language sql
as $$
  with recursive thread as (
    select id from messages where id = p_message_id
    union all
    select m.id from messages m join thread t on m.reply_to_id = t.id
  ),
  marked as (
    update messages
       set deleted_at = now(), deleted_by = p_deleted_by
     where id in (select id from thread) and deleted_at is null
    returning 1
  )
  select count(*)::integer from marked;
$$;
