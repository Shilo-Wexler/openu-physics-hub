-- Who did what in the chat moderation. The chat side only records that "a moderator" acted,
-- so the admin console keeps its own log. Targets are ids in the chat backend.
-- reopen and restore are undos: of a dismiss and of a remove. undoes points at the action undone,
-- and is unique, so an action is undone at most once.
create table moderation_actions (
  id          bigint generated always as identity primary key,
  admin_email text not null check (admin_email = lower(trim(admin_email))),
  action      text not null check (action in ('dismiss', 'remove', 'block', 'unblock', 'reopen', 'restore')),
  message_id  bigint,
  user_id     uuid,
  undoes      bigint unique references moderation_actions (id),
  created_at  timestamptz not null default now(),
  -- Message actions name a message; user actions name a user.
  constraint moderation_actions_target check (
    (action in ('dismiss', 'remove', 'reopen', 'restore') and message_id is not null and user_id is null)
    or (action in ('block', 'unblock') and user_id is not null and message_id is null)
  ),
  -- Only these two are only ever undos.
  constraint moderation_actions_undo check (action not in ('reopen', 'restore') or undoes is not null)
);

create index moderation_actions_time_idx on moderation_actions (created_at desc, id desc);
-- The later actions on one message or one user: whether an action is still the latest, so it can be undone.
create index moderation_actions_message_idx on moderation_actions (message_id, id) where message_id is not null;
create index moderation_actions_user_idx on moderation_actions (user_id, id) where user_id is not null;