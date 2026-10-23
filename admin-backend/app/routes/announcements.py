"""Committee announcements. Two routers in one file, because both sides share the same columns and shape:

- router: the public site, GET /api/announcements, the pinned one, and each announcement's image. No sign-in.
- admin_router: the console, /api/admin/announcements. Needs the "announcements" role (or "admin").

A new announcement is a draft until it is published. Any number can be published; at most one, which
must be published, is pinned to the site's home page. Title, text and image are each optional, but a
published announcement always has at least one of them: publishing an empty one, or emptying a
published one, is refused with 422 "announcement is empty". A draft may be empty, because the console
saves the text before it uploads the image. Only GET, POST and DELETE are used (the CORS setup in
main.py allows nothing else), so every change is a POST to /{id} or /{id}/<action>.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from psycopg import Connection

from ..auth import GoogleUser, require_role
from ..config import MAX_PAGE_SIZE
from ..db import get_conn
from ..images import MAX_UPLOAD_BYTES, InvalidImage, prepare_image
from ..schemas import AnnouncementIn, ImageAlt

# Announcements per page on the public site (the pinned one comes on top of the first page).
PUBLIC_PAGE_SIZE = 20

# The image URL carries ?v=<image_version>, which changes whenever the image does,
# so a browser may keep an image for a year without ever showing an old one.
# The console's copy is "private": it may include drafts, so no shared cache may keep it.
PUBLIC_IMAGE_CACHE = "public, max-age=31536000, immutable"
ADMIN_IMAGE_CACHE = "private, max-age=31536000, immutable"

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

require_announcements = require_role("announcements")

router = APIRouter(prefix="/api/announcements", tags=["public"])
admin_router = APIRouter(
    prefix="/api/admin/announcements", tags=["admin"], dependencies=[Depends(require_announcements)]
)


def _shape(row: dict, image_base: str = "/api/announcements") -> dict:
    """A DB row as the API returns it: the image columns become one "image" object, or null.
    The console gets its own image URL, which also works for drafts and needs the sign-in token."""
    item = {key: row[key] for key in ("id", "title", "body", "pinned", "published_at", "edited_at")}
    item["image"] = (
        {
            "url": f"{image_base}/{row['id']}/image?v={row['image_version']}",
            "width": row["image_width"],
            "height": row["image_height"],
            "alt": row["image_alt"],
        }
        if row["has_image"]
        else None
    )
    for key in ("created_at", "author_email"):
        if key in row:
            item[key] = row[key]
    return item


def _admin_shape(row: dict) -> dict:
    return _shape(row, "/api/admin/announcements")


def _image_response(data: bytes, cache: str) -> Response:
    # nosniff: the browser must treat it as an image and nothing else.
    return Response(
        content=data, media_type="image/webp", headers={"Cache-Control": cache, "X-Content-Type-Options": "nosniff"}
    )


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "announcement not found")


def _refused(conn: Connection, announcement_id: int) -> HTTPException:
    """Why a change guarded by HAS_CONTENT updated no row: the announcement is missing (404),
    or the change would leave a published announcement empty (422)."""
    exists = conn.execute("select 1 from announcements where id = %s", (announcement_id,)).fetchone()
    if exists is None:
        return _not_found()
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "announcement is empty")


def _cursor(row: dict) -> str:
    """Where the next page starts: just after this announcement, in (published_at, id) order."""
    return f"{row['published_at'].isoformat()}_{row['id']}"


def _parse_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        published_at, announcement_id = cursor.rsplit("_", 1)
        return datetime.fromisoformat(published_at), int(announcement_id)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid before")


async def _raw_body(request: Request) -> bytes:
    """The request body as is: an image upload sends the file itself, not JSON or a form.
    Read here, and not as a Body() parameter, because FastAPI would try to parse a body as JSON."""
    # Refuse an announced oversized upload before reading it into memory; prepare_image checks the real size.
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "image too large")
    return await request.body()


# ---------- Public site ----------

@router.get("")
def list_public(
    before: str | None = Query(None, max_length=100),
    conn: Connection = Depends(get_conn),
):
    """Published announcements, newest first, PUBLIC_PAGE_SIZE at a time. The first page (no before)
    starts with the pinned one. Later pages: before=next_before. next_before is null on the last page."""
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

    return {
        "announcements": [_shape(row) for row in pinned + rows],
        "next_before": _cursor(rows[-1]) if has_more else None,
    }


@router.get("/pinned")
def get_pinned(conn: Connection = Depends(get_conn)):
    """The announcement on the home page, or null when none is pinned. One row, for a fast home page."""
    row = conn.execute(f"select {COLUMNS} from announcements where pinned").fetchone()
    return _shape(row) if row else None


@router.get("/{announcement_id}/image")
def get_image(announcement_id: int, conn: Connection = Depends(get_conn)):
    """The image bytes, only for a published announcement. Always WebP (see app/images.py)."""
    row = conn.execute(
        "select image from announcements where id = %s and image is not null and published_at is not null",
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    return _image_response(bytes(row["image"]), PUBLIC_IMAGE_CACHE)


# ---------- Console: the list and the text ----------

@admin_router.get("")
def list_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
    conn: Connection = Depends(get_conn),
):
    """Every announcement, drafts included, with its author. Same page/total shape as the requests list."""
    total = conn.execute("select count(*) as n from announcements").fetchone()["n"]
    rows = conn.execute(
        f"select {ADMIN_COLUMNS} from announcements {ADMIN_ORDER} limit %(limit)s offset %(offset)s",
        {"limit": page_size, "offset": (page - 1) * page_size},
    ).fetchall()
    return {"items": [_admin_shape(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@admin_router.post("", status_code=status.HTTP_201_CREATED)
def create_announcement(
    payload: AnnouncementIn,
    user: GoogleUser = Depends(require_announcements),
    conn: Connection = Depends(get_conn),
):
    """Saved as a draft, which may be empty (an image-only one gets its image next).
    The image (POST /{id}/image) and publishing (POST /{id}/publish) come next."""
    row = conn.execute(
        f"insert into announcements (title, body, author_email) "
        f"values (%(title)s, %(body)s, %(author)s) returning {ADMIN_COLUMNS}",
        {**payload.model_dump(), "author": user.email},
    ).fetchone()
    return _admin_shape(row)


@admin_router.post("/{announcement_id}")
def edit_announcement(announcement_id: int, payload: AnnouncementIn, conn: Connection = Depends(get_conn)):
    """Replaces the title and the text. Saving the same text again does not mark it as edited.
    A published announcement keeps something to show: emptying both with no image is refused."""
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
        {**payload.model_dump(), "id": announcement_id},
    ).fetchone()
    if row is None:
        raise _refused(conn, announcement_id)
    return _admin_shape(row)


@admin_router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(announcement_id: int, conn: Connection = Depends(get_conn)):
    """Permanently deletes the announcement and its image."""
    row = conn.execute("delete from announcements where id = %s returning id", (announcement_id,)).fetchone()
    if row is None:
        raise _not_found()


# ---------- Console: publishing and the home page ----------

def _pin(conn: Connection, announcement_id: int) -> None:
    """Makes this announcement the pinned one, unpinning the previous one. The caller checks it exists.
    The lock makes "unpin the old, pin the new" one step even when two admins pin at the same moment."""
    conn.execute("select pg_advisory_xact_lock(%s)", (PIN_LOCK_KEY,))
    conn.execute("update announcements set pinned = false where pinned and id <> %s", (announcement_id,))
    conn.execute("update announcements set pinned = true where id = %s", (announcement_id,))


def _get_admin(conn: Connection, announcement_id: int) -> dict:
    row = conn.execute(f"select {ADMIN_COLUMNS} from announcements where id = %s", (announcement_id,)).fetchone()
    if row is None:
        raise _not_found()
    return _admin_shape(row)


@admin_router.post("/{announcement_id}/publish")
def publish(announcement_id: int, pin: bool = False, conn: Connection = Depends(get_conn)):
    """Shows it on the site, at the top of the list (also when publishing again after unpublishing).
    pin=true also puts it on the home page, in place of the one pinned before. An empty one is refused."""
    row = conn.execute(
        f"update announcements set published_at = now(), edited_at = null "
        f"where id = %s and {HAS_CONTENT} returning id",
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise _refused(conn, announcement_id)
    if pin:
        _pin(conn, announcement_id)
    return _get_admin(conn, announcement_id)


@admin_router.post("/{announcement_id}/unpublish")
def unpublish(announcement_id: int, conn: Connection = Depends(get_conn)):
    """Back to a draft: off the site and off the home page. It can be published again."""
    row = conn.execute(
        "update announcements set published_at = null, pinned = false, edited_at = null where id = %s returning id",
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise _not_found()
    return _get_admin(conn, announcement_id)


@admin_router.post("/{announcement_id}/pin")
def pin_announcement(announcement_id: int, conn: Connection = Depends(get_conn)):
    """Puts it on the home page, in place of the one pinned before. Only a published announcement."""
    row = conn.execute(
        "select published_at is not null as published from announcements where id = %s", (announcement_id,)
    ).fetchone()
    if row is None:
        raise _not_found()
    if not row["published"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "announcement is not published")
    _pin(conn, announcement_id)
    return _get_admin(conn, announcement_id)


@admin_router.post("/{announcement_id}/unpin")
def unpin_announcement(announcement_id: int, conn: Connection = Depends(get_conn)):
    """Takes it off the home page; it stays published. The home page then shows no announcement."""
    row = conn.execute(
        "update announcements set pinned = false where id = %s returning id", (announcement_id,)
    ).fetchone()
    if row is None:
        raise _not_found()
    return _get_admin(conn, announcement_id)


# ---------- Console: the image ----------

@admin_router.get("/{announcement_id}/image")
def get_admin_image(announcement_id: int, conn: Connection = Depends(get_conn)):
    """The image of any announcement, drafts included, for the console's preview."""
    row = conn.execute(
        "select image from announcements where id = %s and image is not null", (announcement_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    return _image_response(bytes(row["image"]), ADMIN_IMAGE_CACHE)

@admin_router.post("/{announcement_id}/image")
def upload_image(
    announcement_id: int,
    alt: ImageAlt = Query(),
    # The body is the image file itself (sent as image/jpeg, image/png or image/webp), so no
    # multipart library is needed. The Content-Type is not trusted: prepare_image checks the bytes.
    data: bytes = Depends(_raw_body),
    conn: Connection = Depends(get_conn),
):
    """Adds or replaces the image. 422 with the reason when it is not an image the site accepts."""
    try:
        image = prepare_image(data)
    except InvalidImage as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error))
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
        raise _not_found()
    return _admin_shape(row)


@admin_router.delete("/{announcement_id}/image")
def delete_image(announcement_id: int, conn: Connection = Depends(get_conn)):
    """Removes the image and returns the announcement. Removing an image that is not there is not an error.
    The image of a published announcement with no title and no text is all it shows, so it stays (422)."""
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
    return _admin_shape(row)
