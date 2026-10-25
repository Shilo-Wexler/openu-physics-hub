"""Meeting summaries, console only: /api/admin/meetings. Never shown on the public site.

Every admin level may read, create and edit a summary; deleting one needs an admin (not a committee member).
Each summary keeps who wrote it and who changed it last, as emails. The API returns their names from the
admins table instead, or the email when that admin has since been removed. Only GET, POST and DELETE are
used (the CORS setup in main.py allows nothing else), so an edit is a POST to /{id}.

A summary may have files attached, of any type: only the committee uses the console. Every level may
upload and download one; deleting one needs an admin, like deleting a summary. A file is always sent
back as a download, never shown inside the console, so even an HTML file cannot run in its pages.
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from psycopg import Connection

from app.routes.deps import GoogleUser, require_admin, require_manager
from app.core.db import get_conn
from app.schemas import MeetingIn

router = APIRouter(prefix="/api/admin/meetings", tags=["admin"], dependencies=[Depends(require_admin)])

# Big enough for a protocol, a scan or a presentation; stops a video uploaded by mistake.
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
MAX_FILE_NAME = 255
# The browser's Content-Type is only a hint for the download. Anything odd becomes this.
FALLBACK_CONTENT_TYPE = "application/octet-stream"
MAX_CONTENT_TYPE = 200
# A file never changes (a new upload is a new id), so the browser may keep it. "private": no shared cache.
ATTACHMENT_CACHE = "private, max-age=31536000, immutable"

# One summary with the names of who wrote it and who edited it last.
# Left joins, because a removed admin has no row in admins: then the email is shown.
FULL_SELECT = """
  select m.id, m.title, m.meeting_date, m.content,
         coalesce(creator.name, m.created_by) as created_by_name, m.created_at,
         coalesce(editor.name, m.updated_by) as updated_by_name, m.updated_at
  from meeting_summaries m
  left join admins creator on creator.email = m.created_by
  left join admins editor on editor.email = m.updated_by
"""

# A file's details, never its bytes ("data"), so listing the files of a summary stays light.
ATTACHMENT_SELECT = """
  select a.id, a.file_name, a.size_bytes,
         coalesce(uploader.name, a.uploaded_by) as uploaded_by_name, a.uploaded_at
  from meeting_attachments a
  left join admins uploader on uploader.email = a.uploaded_by
"""


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "meeting summary not found")


def _attachment_not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "attachment not found")


def _get(conn: Connection, meeting_id: int) -> dict:
    """The summary with its files (details only), so the editor needs one request."""
    row = conn.execute(f"{FULL_SELECT} where m.id = %s", (meeting_id,)).fetchone()
    if row is None:
        raise _not_found()
    # Upload order, read with meeting_attachments_meeting_idx.
    row["attachments"] = conn.execute(
        f"{ATTACHMENT_SELECT} where a.meeting_id = %s order by a.id", (meeting_id,)
    ).fetchall()
    return row


def _clean_file_name(name: str) -> str:
    """The name the file is saved and downloaded as: no folders (some browsers send a full path), trimmed."""
    name = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "file name is empty")
    if len(name) > MAX_FILE_NAME:
        # Keep the extension, so the downloaded file still opens with the right app.
        stem, dot, extension = name.rpartition(".")
        if dot and 0 < len(extension) < 20:
            name = stem[: MAX_FILE_NAME - len(extension) - 1] + "." + extension
        else:
            name = name[:MAX_FILE_NAME]
    return name


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
def list_meetings(conn: Connection = Depends(get_conn)):
    """Every summary, newest meeting first (meeting_summaries_date_idx). Never the text, so the list stays light.
    No paging: a committee writes a few summaries a month, so even years of them are a small list."""
    rows = conn.execute(
        "select id, title, meeting_date from meeting_summaries order by meeting_date desc, id desc"
    ).fetchall()
    return {"items": rows}


@router.get("/{meeting_id}")
def get_meeting(meeting_id: int, conn: Connection = Depends(get_conn)):
    return _get(conn, meeting_id)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_meeting(
    payload: MeetingIn,
    user: GoogleUser = Depends(require_admin),
    conn: Connection = Depends(get_conn),
):
    """The writer is also the last editor, so updated_by is never empty."""
    row = conn.execute(
        "insert into meeting_summaries (title, meeting_date, content, created_by, updated_by) "
        "values (%(title)s, %(meeting_date)s, %(content)s, %(email)s, %(email)s) returning id",
        {**payload.model_dump(), "email": user.email},
    ).fetchone()
    return _get(conn, row["id"])


@router.post("/{meeting_id}")
def edit_meeting(
    meeting_id: int,
    payload: MeetingIn,
    user: GoogleUser = Depends(require_admin),
    conn: Connection = Depends(get_conn),
):
    """Replaces the title, the date and the text. Saving with no change is not an edit:
    the row is left as it is, so "edited by" keeps the last real editor."""
    conn.execute(
        """
        update meeting_summaries
        set title = %(title)s, meeting_date = %(meeting_date)s, content = %(content)s,
            updated_by = %(email)s, updated_at = now()
        where id = %(id)s
          and (title, meeting_date, content) is distinct from (%(title)s, %(meeting_date)s, %(content)s)
        """,
        {**payload.model_dump(), "email": user.email, "id": meeting_id},
    )
    # 404 here when it does not exist; an unchanged one is returned as it is.
    return _get(conn, meeting_id)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_manager)])
def delete_meeting(meeting_id: int, conn: Connection = Depends(get_conn)):
    """Permanently deletes the summary and its files (on delete cascade). Admins only (403 for a committee member)."""
    row = conn.execute("delete from meeting_summaries where id = %s returning id", (meeting_id,)).fetchone()
    if row is None:
        raise _not_found()


# ---------- Attachments ----------

@router.post("/{meeting_id}/attachments", status_code=status.HTTP_201_CREATED)
def upload_attachment(
    meeting_id: int,
    request: Request,
    name: str = Query(min_length=1, max_length=1000),
    # The body is the file itself, sent with its own Content-Type.
    data: bytes = Depends(_raw_file),
    user: GoogleUser = Depends(require_admin),
    conn: Connection = Depends(get_conn),
):
    """Adds one file and returns its details. Not an edit of the summary: the file shows who uploaded it.
    404 when the summary does not exist, 422 when the file is empty or over the size limit."""
    row = conn.execute(
        """
        insert into meeting_attachments (meeting_id, file_name, content_type, size_bytes, data, uploaded_by)
        select id, %(name)s, %(type)s, %(size)s, %(data)s, %(email)s
        from meeting_summaries where id = %(meeting_id)s
        returning id
        """,
        {
            "meeting_id": meeting_id,
            "name": _clean_file_name(name),
            "type": _content_type(request),
            "size": len(data),
            "data": data,
            "email": user.email,
        },
    ).fetchone()
    if row is None:
        raise _not_found()
    return conn.execute(f"{ATTACHMENT_SELECT} where a.id = %s", (row["id"],)).fetchone()


@router.get("/{meeting_id}/attachments/{attachment_id}")
def download_attachment(meeting_id: int, attachment_id: int, conn: Connection = Depends(get_conn)):
    """The file itself, always as a download with its original name."""
    row = conn.execute(
        "select file_name, content_type, data from meeting_attachments where id = %s and meeting_id = %s",
        (attachment_id, meeting_id),
    ).fetchone()
    if row is None:
        raise _attachment_not_found()
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
def delete_attachment(meeting_id: int, attachment_id: int, conn: Connection = Depends(get_conn)):
    """Permanently deletes one file. Admins only (403 for a committee member)."""
    row = conn.execute(
        "delete from meeting_attachments where id = %s and meeting_id = %s returning id",
        (attachment_id, meeting_id),
    ).fetchone()
    if row is None:
        raise _attachment_not_found()