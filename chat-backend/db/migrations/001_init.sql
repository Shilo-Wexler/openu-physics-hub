-- Chat DB initial schema: tables, keys, checks, indexes and the blocked-user trigger.
-- All other logic and permission checks live in the Python backend.
-- Course data is loaded separately from shared/courses.csv (repo root).

-- Users. id is an internal uuid set by the app (not the Google id).
-- avatar is the key of a ready-made picture (e.g. 'atom'); the list of keys lives in the backend.
-- blocked_at null = not blocked; set and cleared from the admin console.
create table users (
  id         uuid primary key,
  nickname   text not null check (length(trim(nickname)) between 3 and 30),
  avatar     text not null,
  blocked_at timestamptz,
  created_at timestamptz not null default now()
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

-- Messages: course reviews and the discussion under each one, one level deep.
-- deleted_at null = active message. Rows are never physically deleted.
-- thread_id: null for a review; for a reply, the review it belongs to.
-- reply_to_id: the message a reply quotes (WhatsApp style); null when it just answers the review.
-- Both must be in the same course as the message itself.
-- like_count is kept up to date by the backend with each like and unlike,
-- so sorting reviews by likes needs no counting.
-- deleted_by says who deleted it: the author or a moderator (from the admin console).
-- deleted_at and deleted_by are either both set or both null.
create table messages (
  id          bigint generated always as identity primary key,
  course_id   integer not null references courses (id),
  user_id     uuid not null references users (id),
  thread_id   bigint,
  reply_to_id bigint,
  content     text not null check (length(trim(content)) between 1 and 4000),
  like_count  integer not null default 0 check (like_count >= 0),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  deleted_by  text check (deleted_by in ('author', 'moderator')),
  unique (id, course_id),
  constraint messages_deleted_fields_together check ((deleted_at is null) = (deleted_by is null)),
  constraint messages_quote_needs_thread check (reply_to_id is null or thread_id is not null),
  foreign key (thread_id, course_id) references messages (id, course_id),
  foreign key (reply_to_id, course_id) references messages (id, course_id)
);

-- A course's reviews, newest first. Deleted reviews stay in the index: one that
-- still has replies is shown as "deleted" above its discussion.
-- id breaks ties between messages with the same created_at.
create index messages_reviews_new_idx on messages (course_id, created_at desc, id desc)
  where thread_id is null;
-- A course's active reviews, most liked first.
create index messages_reviews_top_idx on messages (course_id, like_count desc, id desc)
  where thread_id is null and deleted_at is null;
-- The replies of one review, oldest first (also used to count them).
create index messages_thread_idx on messages (thread_id, created_at, id)
  where thread_id is not null;
-- A user's messages, for the admin console (removed messages, report counts).
create index messages_user_idx on messages (user_id);

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
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  constraint reports_one_per_user unique (message_id, reporter_id)
);

-- Open reports per message, for the admin console's list.
create index reports_open_idx on reports (message_id) where status = 'open';

-- Blocked users cannot write: rejects new messages, edits, likes, ratings and reports.
-- The trigger argument is the name of the column that holds the acting user's id.
create function reject_blocked_user()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from users
     where id = (to_jsonb(new) ->> tg_argv[0])::uuid and blocked_at is not null
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
  