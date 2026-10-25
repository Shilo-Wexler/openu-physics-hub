"""Meeting summary input models. Lengths match db/migrations/007_meetings.sql."""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, StringConstraints


class MeetingIn(BaseModel):
    """Creating or editing a meeting summary: always every field, so the console sends what it shows."""

    # Optional: "" means no title, and the console names the summary by its date.
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    # "YYYY-MM-DD", the day of the meeting (not when the summary was written).
    meeting_date: date
    # Plain text. Optional too ("" means none): a summary may be just its attached files.
    # The console asks for text or a file; the server cannot, because files are uploaded after the summary.
    content: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20000)] = ""