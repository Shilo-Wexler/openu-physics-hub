"""Committee announcements: drafts, publishing, the one pinned to the home page, and the image.

A new announcement is a draft until it is published. Any number can be published; at most one, which
must be published, is pinned. Title, text and image are each optional, but a published announcement
always has at least one of them: publishing an empty one, or emptying a published one, raises Empty.
A draft may be empty, because the console saves the text before it uploads the image.
Team works on drafts only (lock_draft_for_team).
"""

from datetime import datetime

from psycopg import Connection

from app.services.images import prepare_image

# Announcements per page on the public site (the pinned one comes on top of the first page).
PUBLIC_PAGE_SIZE = 20

# Never "image" itself: lists must not read the image bytes. "image is not null" does not read them.
COLUMNS = """
  id, title, body, pinned, published_at, edited_at,
  image is not null as has_image, image_width, image_height, image_alt, image_version
"""
ADMIN_COLUMNS = COLUMNS + ", created_at, author_email"

# Pinned first, then drafts (work in progress), then the published ones, newest first.
ADMIN_ORDER = "order by pinned desc, published_at desc nulls first, id desc"

# Text or image changes count as an edit only once the site shows the announcement.
MARK_EDITED = "edited_at = case when published_at is null then edited_at else now() end"

# The row has something to show. Title and body are stored trimmed (AnnouncementIn), so "" means none.
# Each change that could leave a published announcement empty puts this in its WHERE, so the check and
# the change are one statement, and two admins editing at once cannot slip past it.
HAS_CONTENT = "(title <> '' or body <> '' or image is not null)"

# Any constant works: pinning takes this lock, so two admins pinning at once run one after the other.
PIN_LOCK_KEY = 5_000_001


class NotFound(Exception):
    pass


class ImageNotFound(Exception):
    pass


class Empty(Exception):
    """The change would leave a published announcement with nothing to show."""


class NotPublished(Exception):
    """Only a published announcement can be pinned."""


class PublishedNeedsManager(Exception):
    """Team tried to change or delete a published announcement."""


class InvalidCursor(Exception):
    pass


def _refused(conn: Connection, announcement_id: int) -> Exception:
    """Why a change guarded by HAS_CONTENT updated no row: the announcement is missing,
    or the change would leave a published announcement empty."""
    exists = conn.execute("select 1 from announcements where id = %s", (announcement_id,)).fetchone()
    return NotFound() if exists is None else Empty()


def _cursor(row: dict) -> str:
    """Where the next page starts: just after this announcement, in (published_at, id) order."""
    return f"{row['published_at'].isoformat()}_{row['id']}"


def _parse_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        published_at, announcement_id = cursor.rsplit("_", 1)
        return datetime.fromisoformat(published_at), int(announcement_id)
    except ValueError:
        raise InvalidCursor() from None


def _get(conn: Connection, announcement_id: int) -> dict:
    row = conn.execute(f"select {ADMIN_COLUMNS} from announcements where id = %s", (announcement_id,)).fetchone()
    if row is None:
        raise NotFound()
    return row


# ---------- Public site ----------

def list_public(conn: Connection, before: str | None) -> tuple[list[dict], str | None]:
    """Published announcements, newest first, PUBLIC_PAGE_SIZE at a time, and the cursor of the next page
    (None on the last one). The first page (no before) starts with the pinned one."""
    pinned = []
    if before is None:
        pinned = conn.execute(f"select {COLUMNS} from announcements where pinned").fetchall()
        after_cursor, params = "", {}
    else:
        published_at, announcement_id = _parse_cursor(before)
        after_cursor = "and (published_at, id) < (%(published_at)s, %(id)s)"
        params = {"published_at": published_at, "id": announcement_id}

    # The pinned one is already on top of the first page, so it is left out here.
    # One extra row tells whether another page exists, without a separate count query.
    rows = conn.execute(
        f"select {COLUMNS} from announcements where published_at is not null and not pinned {after_cursor} "
        "order by published_at desc, id desc limit %(limit)s",
        {**params, "limit": PUBLIC_PAGE_SIZE + 1},
    ).fetchall()
    has_more = len(rows) > PUBLIC_PAGE_SIZE
    rows = rows[:PUBLIC_PAGE_SIZE]
    return pinned + rows, _cursor(rows[-1]) if has_more else None


def get_pinned(conn: Connection) -> dict | None:
    """The announcement on the home page, or None when none is pinned. One row, for a fast home page."""
    return conn.execute(f"select {COLUMNS} from announcements where pinned").fetchone()


def public_image(conn: Connection, announcement_id: int) -> bytes:
    """The image bytes, only for a published announcement. Always WebP (see services/images.py)."""
    row = conn.execute(
        "select image from announcements where id = %s and image is not null and published_at is not null",
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise ImageNotFound()
    return bytes(row["image"])


# ---------- Console: the list and the text ----------

def lock_draft_for_team(conn: Connection, announcement_id: int) -> None:
    """For team, who may change or delete only a draft. The row stays locked until the
    change is saved, so it cannot be published in between."""
    row = conn.execute(
        "select published_at is not null as published from announcements where id = %s for update",
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise NotFound()
    if row["published"]:
        raise PublishedNeedsManager()


def list_admin(conn: Connection, page: int, page_size: int) -> tuple[list[dict], int]:
    """One page of every announcement, drafts included, with its author, and how many there are in all."""
    total = conn.execute("select count(*) as n from announcements").fetchone()["n"]
    rows = conn.execute(
        f"select {ADMIN_COLUMNS} from announcements {ADMIN_ORDER} limit %(limit)s offset %(offset)s",
        {"limit": page_size, "offset": (page - 1) * page_size},
    ).fetchall()
    return rows, total


def create(conn: Connection, author_email: str, fields: dict) -> dict:
    """fields: title, body. Saved as a draft, which may be empty (an image-only one gets its image next)."""
    return conn.execute(
        f"insert into announcements (title, body, author_email) "
        f"values (%(title)s, %(body)s, %(author)s) returning {ADMIN_COLUMNS}",
        {**fields, "author": author_email},
    ).fetchone()


def edit(conn: Connection, announcement_id: int, fields: dict) -> dict:
    """Replaces the title and the text. Saving the same text again does not mark it as edited.
    A published announcement keeps something to show: emptying both with no image raises Empty."""
    row = conn.execute(
        f"""
        update announcements
        set title = %(title)s, body = %(body)s,
            edited_at = case when published_at is not null
                              and (title is distinct from %(title)s or body is distinct from %(body)s)
                             then now() else edited_at end
        where id = %(id)s
          and (published_at is null or %(title)s <> '' or %(body)s <> '' or image is not null)
        returning {ADMIN_COLUMNS}
        """,
        {**fields, "id": announcement_id},
    ).fetchone()
    if row is None:
        raise _refused(conn, announcement_id)
    return row


def delete(conn: Connection, announcement_id: int) -> None:
    """Permanently deletes the announcement and its image."""
    row = conn.execute("delete from announcements where id = %s returning id", (announcement_id,)).fetchone()
    if row is None:
        raise NotFound()


# ---------- Console: publishing and the home page ----------

def _pin(conn: Connection, announcement_id: int) -> None:
    """Makes this announcement the pinned one, unpinning the previous one. The caller checks it exists.
    The lock makes "unpin the old, pin the new" one step even when two admins pin at the same moment."""
    conn.execute("select pg_advisory_xact_lock(%s)", (PIN_LOCK_KEY,))
    conn.execute("update announcements set pinned = false where pinned and id <> %s", (announcement_id,))
    conn.execute("update announcements set pinned = true where id = %s", (announcement_id,))


def publish(conn: Connection, announcement_id: int, also_pin: bool) -> dict:
    """Shows it on the site, at the top of the list (also when publishing again after unpublishing).
    also_pin puts it on the home page too, in place of the one pinned before. An empty one raises Empty."""
    row = conn.execute(
        f"update announcements set published_at = now(), edited_at = null "
        f"where id = %s and {HAS_CONTENT} returning id",
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise _refused(conn, announcement_id)
    if also_pin:
        _pin(conn, announcement_id)
    return _get(conn, announcement_id)


def unpublish(conn: Connection, announcement_id: int) -> dict:
    """Back to a draft: off the site and off the home page. It can be published again."""
    row = conn.execute(
        "update announcements set published_at = null, pinned = false, edited_at = null where id = %s returning id",
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise NotFound()
    return _get(conn, announcement_id)


def pin(conn: Connection, announcement_id: int) -> dict:
    """Puts it on the home page, in place of the one pinned before. Only a published announcement."""
    row = conn.execute(
        "select published_at is not null as published from announcements where id = %s", (announcement_id,)
    ).fetchone()
    if row is None:
        raise NotFound()
    if not row["published"]:
        raise NotPublished()
    _pin(conn, announcement_id)
    return _get(conn, announcement_id)


def unpin(conn: Connection, announcement_id: int) -> dict:
    """Takes it off the home page; it stays published. The home page then shows no announcement."""
    row = conn.execute(
        "update announcements set pinned = false where id = %s returning id", (announcement_id,)
    ).fetchone()
    if row is None:
        raise NotFound()
    return _get(conn, announcement_id)


# ---------- Console: the image ----------

def admin_image(conn: Connection, announcement_id: int) -> bytes:
    """The image of any announcement, drafts included, for the console's preview."""
    row = conn.execute(
        "select image from announcements where id = %s and image is not null", (announcement_id,)
    ).fetchone()
    if row is None:
        raise ImageNotFound()
    return bytes(row["image"])


def set_image(conn: Connection, announcement_id: int, data: bytes, alt: str) -> dict:
    """Adds or replaces the image. Raises InvalidImage (services/images.py) when it is not one the site accepts."""
    image = prepare_image(data)
    row = conn.execute(
        f"""
        update announcements
        set image = %(image)s, image_width = %(width)s, image_height = %(height)s, image_alt = %(alt)s,
            image_version = image_version + 1, {MARK_EDITED}
        where id = %(id)s
        returning {ADMIN_COLUMNS}
        """,
        {"image": image.data, "width": image.width, "height": image.height, "alt": alt, "id": announcement_id},
    ).fetchone()
    if row is None:
        raise NotFound()
    return row


def delete_image(conn: Connection, announcement_id: int) -> dict:
    """Removes the image. Removing an image that is not there is not an error.
    The image of a published announcement with no title and no text is all it shows, so it stays (Empty)."""
    row = conn.execute(
        f"""
        update announcements
        set image = null, image_width = null, image_height = null, image_alt = null,
            image_version = image_version + case when image is null then 0 else 1 end,
            edited_at = case when image is null or published_at is null then edited_at else now() end
        where id = %s
          and (published_at is null or title <> '' or body <> '' or image is null)
        returning {ADMIN_COLUMNS}
        """,
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise _refused(conn, announcement_id)
    return row