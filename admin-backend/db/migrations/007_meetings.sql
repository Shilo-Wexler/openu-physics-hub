-- Meeting summaries, written and read in the admin console only. Never exposed to the public site.
-- Every level can create and edit; only admin and super_admin can delete (checked by the backend).

create table meeting_summaries (
  id           bigint generated always as identity primary key,
  -- Optional: '' means no title (stored trimmed), and the console names the summary by its date.
  title        text not null default '' check (char_length(title) <= 120),
  meeting_date date not null,
  -- Optional too ('' = none, stored trimmed): a summary may be just its attached files.
  -- The console asks for text or at least one file; the server cannot, because a new summary
  -- is created before its files are uploaded.
  content      text not null default '' check (char_length(content) <= 20000),
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

-- Files attached to a summary, kept as they were uploaded (any type; the backend caps the size).
-- They go when their summary is deleted. Every level can add one; only admins can delete one.
create table meeting_attachments (
  id           bigint generated always as identity primary key,
  meeting_id   bigint not null references meeting_summaries (id) on delete cascade,
  file_name    text not null check (char_length(file_name) between 1 and 255),
  -- As the browser sent it. Only used for the download; the file is always sent as a download.
  content_type text not null,
  size_bytes   integer not null check (size_bytes > 0),
  data         bytea not null,
  -- Like created_by above: plain email, so the history stays when the admin is removed.
  uploaded_by  text not null check (uploaded_by = lower(trim(uploaded_by))),
  uploaded_at  timestamptz not null default now()
);

-- Most uploads (PDF, Office, images) are already compressed, so Postgres stores them
-- without trying to compress them again. That saves CPU on every upload and download.
alter table meeting_attachments alter column data set storage external;

-- One summary's files, in upload order.
create index meeting_attachments_meeting_idx on meeting_attachments (meeting_id, id);