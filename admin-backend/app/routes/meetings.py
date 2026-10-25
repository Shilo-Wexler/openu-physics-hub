"""Meeting summaries, console only: /api/admin/meetings. Never shown on the public site.

Every level may read, create and edit a summary; deleting one needs committee or admin (not team).
Only GET, POST and DELETE are used (the CORS setup in main.py allows nothing else), so an edit is a POST to /{id}.

A summary may have files attached, of any type: only the committee uses the console. Every level may
upload and download one; deleting one needs an admin, like deleting a summary. A file is always sent
back as a download, never shown inside the console, so even an HTML file cannot run in its pages.
The rules and the SQL are in services/meetings.py.
"""

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.routes.deps import Admin, Conn, http_errors, require_admin, require_manager
from app.schemas.meetings import MeetingIn
from app.services import meetings

router = APIRouter(prefix="/api/admin/meetings", tags=["admin"], dependencies=[Depends(require_admin)])

# Big enough for a protocol, a scan or a presentation; stops a video uploaded by mistake.
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
# The browser's Content-Type is only a hint for the download. Anything odd becomes this.
FALLBACK_CONTENT_TYPE = "application/octet-stream"
MAX_CONTENT_TYPE = 200
# A file never changes (a new upload is a new id), so the browser may keep it. "private": no shared cache.
ATTACHMENT_CACHE = "private, max-age=31536000, immutable"

# What each error of services/meetings.py means for the console.
_ERRORS = {
    meetings.NotFound: (status.HTTP_404_NOT_FOUND, "meeting summary not found"),
    meetings.AttachmentNotFound: (status.HTTP_404_NOT_FOUND, "attachment not found"),
    meetings.EmptyFileName: (status.HTTP_422_UNPROCESSABLE_ENTITY, "file name is empty"),
}


def _content_type(request: Request) -> str:
    value = request.headers.get("content-type", "").strip()
    if not value or len(value) > MAX_CONTENT_TYPE or "/" not in value:
        return FALLBACK_CONTENT_TYPE
    return value


async def _raw_file(request: Request) -> bytes:
    """The request body as is: an upload sends the file itself, not JSON or a form, so no multipart
    library is needed. Read here, and not as a Body() parameter, because FastAPI would parse it as JSON."""
    # Refuse an announced oversized upload before reading it into memory; the real size is checked after.
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "file too large")
    data = await request.body()
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "file too large")
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "file is empty")
    return data


@router.get("")
def list_meetings(conn: Conn):
    return {"items": meetings.list_all(conn)}


@router.get("/{meeting_id}")
def get_meeting(meeting_id: int, conn: Conn):
    with http_errors(_ERRORS):
        return meetings.get(conn, meeting_id)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_meeting(payload: MeetingIn, user: Admin, conn: Conn):
    return meetings.create(conn, user.email, payload.model_dump())


@router.post("/{meeting_id}")
def edit_meeting(meeting_id: int, payload: MeetingIn, user: Admin, conn: Conn):
    with http_errors(_ERRORS):
        return meetings.edit(conn, meeting_id, user.email, payload.model_dump())


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_manager)])
def delete_meeting(meeting_id: int, conn: Conn):
    """Committee and admin only (403 for team)."""
    with http_errors(_ERRORS):
        meetings.delete(conn, meeting_id)


# ---------- Attachments ----------

@router.post("/{meeting_id}/attachments", status_code=status.HTTP_201_CREATED)
def upload_attachment(
    meeting_id: int,
    request: Request,
    name: Annotated[str, Query(min_length=1, max_length=1000)],
    # The body is the file itself, sent with its own Content-Type.
    data: Annotated[bytes, Depends(_raw_file)],
    user: Admin,
    conn: Conn,
):
    """404 when the summary does not exist, 422 when the file is empty or over the size limit."""
    with http_errors(_ERRORS):
        return meetings.add_attachment(conn, meeting_id, user.email, name, _content_type(request), data)


@router.get("/{meeting_id}/attachments/{attachment_id}")
def download_attachment(meeting_id: int, attachment_id: int, conn: Conn):
    """The file itself, always as a download with its original name."""
    with http_errors(_ERRORS):
        row = meetings.get_attachment(conn, meeting_id, attachment_id)
    # filename* carries the real (often Hebrew) name; filename is the plain fallback for old clients.
    disposition = f"attachment; filename=\"download\"; filename*=UTF-8''{quote(row['file_name'], safe='')}"
    return Response(
        content=bytes(row["data"]),
        media_type=row["content_type"],
        headers={
            "Content-Disposition": disposition,
            # The browser must not guess another type from the bytes (and, say, run it as HTML).
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": ATTACHMENT_CACHE,
        },
    )


@router.delete(
    "/{meeting_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_manager)],
)
def delete_attachment(meeting_id: int, attachment_id: int, conn: Conn):
    """Permanently deletes one file. Committee and admin only (403 for team)."""
    with http_errors(_ERRORS):
        meetings.delete_attachment(conn, meeting_id, attachment_id)
        