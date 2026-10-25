"""Committee announcements. Two routers in one file, because both sides share the same columns and shape:

- router: the public site, GET /api/announcements, the pinned one, and each announcement's image. No sign-in.
- admin_router: the console, /api/admin/announcements. Every admin level may use it, but a team
  member works on drafts only: publishing, pinning, and changing or deleting a published one need committee or admin.

The rules and the SQL are in services/announcements.py. Only GET, POST and DELETE are used (the CORS
setup in main.py allows nothing else), so every change is a POST to /{id} or /{id}/<action>.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.routes.deps import Admin, Conn, http_errors, require_admin, require_manager
from app.schemas.announcements import AnnouncementIn, ImageAlt
from app.services import announcements
from app.services.images import MAX_UPLOAD_BYTES, InvalidImage

# The console's list pages.
MAX_PAGE_SIZE = 100

# The image URL carries ?v=<image_version>, which changes whenever the image does,
# so a browser may keep an image for a year without ever showing an old one.
# The console's copy is "private": it may include drafts, so no shared cache may keep it.
PUBLIC_IMAGE_CACHE = "public, max-age=31536000, immutable"
ADMIN_IMAGE_CACHE = "private, max-age=31536000, immutable"

router = APIRouter(prefix="/api/announcements", tags=["public"])
admin_router = APIRouter(prefix="/api/admin/announcements", tags=["admin"], dependencies=[Depends(require_admin)])

# What each error of the services means for the client. None: the error's own message is the detail.
_ERRORS = {
    announcements.NotFound: (status.HTTP_404_NOT_FOUND, "announcement not found"),
    announcements.ImageNotFound: (status.HTTP_404_NOT_FOUND, "image not found"),
    announcements.Empty: (status.HTTP_422_UNPROCESSABLE_ENTITY, "announcement is empty"),
    announcements.NotPublished: (status.HTTP_409_CONFLICT, "announcement is not published"),
    announcements.PublishedNeedsManager: (status.HTTP_403_FORBIDDEN, "requires a committee member"),
    announcements.InvalidCursor: (status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid before"),
    InvalidImage: (status.HTTP_422_UNPROCESSABLE_ENTITY, None),
}


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


def _drafts_only_for_team(announcement_id: int, user: Admin, conn: Conn) -> None:
    """Team may change or delete only a draft (403 on a published one)."""
    if user.is_team:
        with http_errors(_ERRORS):
            announcements.lock_draft_for_team(conn, announcement_id)


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
def list_public(conn: Conn, before: Annotated[str | None, Query(max_length=100)] = None):
    """Published announcements, newest first, a page at a time; the first page starts with the pinned one.
    Later pages: before=next_before. next_before is null on the last page."""
    with http_errors(_ERRORS):
        rows, next_before = announcements.list_public(conn, before)
    return {"announcements": [_shape(row) for row in rows], "next_before": next_before}


@router.get("/pinned")
def get_pinned(conn: Conn):
    """The announcement on the home page, or null when none is pinned."""
    row = announcements.get_pinned(conn)
    return _shape(row) if row else None


@router.get("/{announcement_id}/image")
def get_image(announcement_id: int, conn: Conn):
    with http_errors(_ERRORS):
        return _image_response(announcements.public_image(conn, announcement_id), PUBLIC_IMAGE_CACHE)


# ---------- Console: the list and the text ----------

@admin_router.get("")
def list_admin(
    conn: Conn,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 25,
):
    """Every announcement, drafts included, with its author."""
    rows, total = announcements.list_admin(conn, page, page_size)
    return {"items": [_admin_shape(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@admin_router.post("", status_code=status.HTTP_201_CREATED)
def create_announcement(payload: AnnouncementIn, user: Admin, conn: Conn):
    """Saved as a draft. The image (POST /{id}/image) and publishing (POST /{id}/publish) come next."""
    return _admin_shape(announcements.create(conn, user.email, payload.model_dump()))


@admin_router.post("/{announcement_id}", dependencies=[Depends(_drafts_only_for_team)])
def edit_announcement(announcement_id: int, payload: AnnouncementIn, conn: Conn):
    with http_errors(_ERRORS):
        return _admin_shape(announcements.edit(conn, announcement_id, payload.model_dump()))


@admin_router.delete(
    "/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(_drafts_only_for_team)]
)
def delete_announcement(announcement_id: int, conn: Conn):
    with http_errors(_ERRORS):
        announcements.delete(conn, announcement_id)


# ---------- Console: publishing and the home page (committee and admin, not team) ----------

@admin_router.post("/{announcement_id}/publish", dependencies=[Depends(require_manager)])
def publish(announcement_id: int, conn: Conn, pin: bool = False):
    """pin=true also puts it on the home page, in place of the one pinned before."""
    with http_errors(_ERRORS):
        return _admin_shape(announcements.publish(conn, announcement_id, also_pin=pin))


@admin_router.post("/{announcement_id}/unpublish", dependencies=[Depends(require_manager)])
def unpublish(announcement_id: int, conn: Conn):
    with http_errors(_ERRORS):
        return _admin_shape(announcements.unpublish(conn, announcement_id))


@admin_router.post("/{announcement_id}/pin", dependencies=[Depends(require_manager)])
def pin_announcement(announcement_id: int, conn: Conn):
    with http_errors(_ERRORS):
        return _admin_shape(announcements.pin(conn, announcement_id))


@admin_router.post("/{announcement_id}/unpin", dependencies=[Depends(require_manager)])
def unpin_announcement(announcement_id: int, conn: Conn):
    with http_errors(_ERRORS):
        return _admin_shape(announcements.unpin(conn, announcement_id))


# ---------- Console: the image ----------

@admin_router.get("/{announcement_id}/image")
def get_admin_image(announcement_id: int, conn: Conn):
    with http_errors(_ERRORS):
        return _image_response(announcements.admin_image(conn, announcement_id), ADMIN_IMAGE_CACHE)


@admin_router.post("/{announcement_id}/image", dependencies=[Depends(_drafts_only_for_team)])
def upload_image(
    announcement_id: int,
    alt: Annotated[ImageAlt, Query()],
    # The body is the image file itself (sent as image/jpeg, image/png or image/webp), so no
    # multipart library is needed. The Content-Type is not trusted: prepare_image checks the bytes.
    data: Annotated[bytes, Depends(_raw_body)],
    conn: Conn,
):
    """Adds or replaces the image. 422 with the reason when it is not an image the site accepts."""
    with http_errors(_ERRORS):
        return _admin_shape(announcements.set_image(conn, announcement_id, data, alt))


@admin_router.delete("/{announcement_id}/image", dependencies=[Depends(_drafts_only_for_team)])
def delete_image(announcement_id: int, conn: Conn):
    """Removes the image and returns the announcement."""
    with http_errors(_ERRORS):
        return _admin_shape(announcements.delete_image(conn, announcement_id))