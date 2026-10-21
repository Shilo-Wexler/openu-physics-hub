-- Committee announcements: written in the admin console, read by everyone on the public site
-- (GET /api/announcements). One optional image per announcement, stored right here: announcements
-- are few and images small, so there is no separate file storage to run and back up.
-- The backend always re-encodes an uploaded image as WebP before saving it (strips metadata such
-- as GPS, and rejects files that are not really images), so only WebP bytes ever reach this table.
create table announcements (
  id            bigint generated always as identity primary key,
  title         text not null check (length(trim(title)) between 1 and 200),
  -- Plain text with line breaks, shown as text (never as HTML). May be empty when there is an image.
  body          text not null default '' check (length(body) <= 5000),
  -- Null: a draft, seen only in the console. Set on every publish, so the site sorts by it.
  published_at  timestamptz,
  -- The one announcement on the site's home page.
  pinned        boolean not null default false,
  -- Not a foreign key: the announcement keeps its author after that admin is removed.
  author_email  text not null check (author_email = lower(trim(author_email))),
  created_at    timestamptz not null default now(),
  -- Last change to the text or the image while published.
  edited_at     timestamptz,
  image         bytea,
  image_width   integer check (image_width between 1 and 1600),
  image_height  integer check (image_height between 1 and 1600),
  image_alt     text check (length(trim(image_alt)) between 1 and 300),
  -- Bumped on every image change and put in the image URL (?v=), so a cached old image is never shown.
  image_version integer not null default 0,
  -- Only a published announcement can be on the home page.
  constraint announcements_pinned_published check (not pinned or published_at is not null),
  -- An image comes with its size and its description, or none of them.
  constraint announcements_image_complete check (
    (image is null and image_width is null and image_height is null and image_alt is null)
    or (image is not null and image_width is not null and image_height is not null and image_alt is not null)
  )
);

-- At most one pinned announcement: a unique index over a constant, limited to the pinned row.
create unique index announcements_one_pinned_idx on announcements ((true)) where pinned;

-- The public list, newest first, page by page (where (published_at, id) < the cursor).
-- Queries name their columns and never select "image", so listing never reads the image bytes
-- (Postgres keeps large values apart from the row and reads them only when asked).
create index announcements_published_idx on announcements (published_at desc, id desc)
  where published_at is not null;
