"""Meeting summaries and their attached files, console only.

Each summary keeps who wrote it and who changed it last, as emails. Reads return their names from the
admins table instead, or the email when that admin has since been removed.
"""

from psycopg import Connection

MAX_FILE_NAME = 255

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


class NotFound(Exception):
    pass


class AttachmentNotFound(Exception):
    pass


class EmptyFileName(Exception):
    pass


def list_all(conn: Connection) -> list[dict]:
    """Every summary, newest meeting first (meeting_summaries_date_idx). Never the text, so the list stays light.
    No paging: a committee writes a few summaries a month, so even years of them are a small list."""
    return conn.execute(
        "select id, title, meeting_date from meeting_summaries order by meeting_date desc, id desc"
    ).fetchall()


def get(conn: Connection, meeting_id: int) -> dict:
    """The summary with its files (details only), so the editor needs one request."""
    row = conn.execute(f"{FULL_SELECT} where m.id = %s", (meeting_id,)).fetchone()
    if row is None:
        raise NotFound()
    # Upload order, read with meeting_attachments_meeting_idx.
    row["attachments"] = conn.execute(
        f"{ATTACHMENT_SELECT} where a.meeting_id = %s order by a.id", (meeting_id,)
    ).fetchall()
    return row


def create(conn: Connection, actor_email: str, fields: dict) -> dict:
    """fields: title, meeting_date, content. The writer is also the last editor, so updated_by is never empty."""
    row = conn.execute(
        "insert into meeting_summaries (title, meeting_date, content, created_by, updated_by) "
        "values (%(title)s, %(meeting_date)s, %(content)s, %(email)s, %(email)s) returning id",
        {**fields, "email": actor_email},
    ).fetchone()
    return get(conn, row["id"])


def edit(conn: Connection, meeting_id: int, actor_email: str, fields: dict) -> dict:
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
        {**fields, "email": actor_email, "id": meeting_id},
    )
    # NotFound here when it does not exist; an unchanged one is returned as it is.
    return get(conn, meeting_id)


def delete(conn: Connection, meeting_id: int) -> None:
    """Permanently deletes the summary and its files (on delete cascade)."""
    row = conn.execute("delete from meeting_summaries where id = %s returning id", (meeting_id,)).fetchone()
    if row is None:
        raise NotFound()


# ---------- Attachments ----------

def clean_file_name(name: str) -> str:
    """The name the file is saved and downloaded as: no folders (some browsers send a full path), trimmed."""
    name = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not name:
        raise EmptyFileName()
    if len(name) > MAX_FILE_NAME:
        # Keep the extension, so the downloaded file still opens with the right app.
        stem, dot, extension = name.rpartition(".")
        if dot and 0 < len(extension) < 20:
            name = stem[: MAX_FILE_NAME - len(extension) - 1] + "." + extension
        else:
            name = name[:MAX_FILE_NAME]
    return name


def add_attachment(
    conn: Connection, meeting_id: int, actor_email: str, file_name: str, content_type: str, data: bytes
) -> dict:
    """Adds one file and returns its details. Not an edit of the summary: the file shows who uploaded it."""
    row = conn.execute(
        """
        insert into meeting_attachments (meeting_id, file_name, content_type, size_bytes, data, uploaded_by)
        select id, %(name)s, %(type)s, %(size)s, %(data)s, %(email)s
        from meeting_summaries where id = %(meeting_id)s
        returning id
        """,
        {
            "meeting_id": meeting_id,
            "name": clean_file_name(file_name),
            "type": content_type,
            "size": len(data),
            "data": data,
            "email": actor_email,
        },
    ).fetchone()
    if row is None:
        raise NotFound()
    return conn.execute(f"{ATTACHMENT_SELECT} where a.id = %s", (row["id"],)).fetchone()


def get_attachment(conn: Connection, meeting_id: int, attachment_id: int) -> dict:
    """The file itself: file_name, content_type and data (the bytes)."""
    row = conn.execute(
        "select file_name, content_type, data from meeting_attachments where id = %s and meeting_id = %s",
        (attachment_id, meeting_id),
    ).fetchone()
    if row is None:
        raise AttachmentNotFound()
    return row


def delete_attachment(conn: Connection, meeting_id: int, attachment_id: int) -> None:
    row = conn.execute(
        "delete from meeting_attachments where id = %s and meeting_id = %s returning id",
        (attachment_id, meeting_id),
    ).fetchone()
    if row is None:
        raise AttachmentNotFound()