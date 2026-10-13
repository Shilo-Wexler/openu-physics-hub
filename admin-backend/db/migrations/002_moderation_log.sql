-- Who did what in the chat moderation. The chat side only records that "a moderator" acted,
-- so the admin console keeps its own log. Targets are ids in the chat backend.
create table moderation_actions (
  id          bigint generated always as identity primary key,
  admin_email text not null check (admin_email = lower(trim(admin_email))),
  action      text not null check (action in ('dismiss', 'remove', 'block', 'unblock')),
  message_id  bigint,
  user_id     uuid,
  created_at  timestamptz not null default now(),
  -- Message actions name a message; user actions name a user.
  constraint moderation_actions_target check (
    (action in ('dismiss', 'remove') and message_id is not null and user_id is null)
    or (action in ('block', 'unblock') and user_id is not null and message_id is null)
  )
);

create index moderation_actions_time_idx on moderation_actions (created_at desc, id desc);
