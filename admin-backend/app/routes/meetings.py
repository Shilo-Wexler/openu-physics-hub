"""Meeting summaries, console only: /api/admin/meetings. Never shown on the public site.

Every admin level may read, create and edit a summary; deleting one needs an admin (not a committee member).
Each summary keeps who wrote it and who changed it last, as emails. The API returns their names from the
admins table instead, or the email when that admin has since been removed. Only GET, POST and DELETE are
used (the CORS setup in main.py allows nothing else), so an edit is a POST to /{id}.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from ..auth import GoogleUser, require_admin, require_manager
from ..db import get_conn
from ..schemas import MeetingIn

router = APIRouter(prefix="/api/admin/meetings", tags=["admin"], dependencies=[Depends(require_admin)])

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


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "meeting summary not found")


def _get(conn: Connection, meeting_id: int) -> dict:
    row = conn.execute(f"{FULL_SELECT} where m.id = %s", (meeting_id,)).fetchone()
    if row is None:
        raise _not_found()
    return row


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
    """Permanently deletes the summary. Admins only (403 for a committee member)."""
    row = conn.execute("delete from meeting_summaries where id = %s returning id", (meeting_id,)).fetchone()
    if row is None:
        raise _not_found()