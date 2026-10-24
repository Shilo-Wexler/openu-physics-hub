-- Meeting summaries, written and read in the admin console only. Never exposed to the public site.
-- Every level can create and edit; only admin and super_admin can delete (checked by the backend).

create table meeting_summaries (
  id           bigint generated always as identity primary key,
  title        text not null check (length(trim(title)) between 1 and 120),
  meeting_date date not null,
  content      text not null check (length(trim(content)) between 1 and 20000),
  -- Admins' emails, kept as plain text (no foreign key), like inquiries.handled_by,
  -- so the history stays when that admin is removed from the admins table.
  created_by   text not null check (created_by = lower(trim(created_by))),
  created_at   timestamptz not null default now(),
  -- Set by the backend on every edit (business logic stays in Python, no trigger).
  updated_by   text not null check (updated_by = lower(trim(updated_by))),
  updated_at   timestamptz not null default now()
);

-- Console list: newest meeting first. id breaks ties between meetings on the same day.
create index meeting_summaries_date_idx on meeting_summaries (meeting_date desc, id desc);