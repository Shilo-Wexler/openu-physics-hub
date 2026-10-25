"""Inquiry input models. Lengths and values match db/migrations/006_inquiries.sql."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

InquiryType = Literal["exams", "staff", "accessibility", "admin", "other"]
InquiryStatus = Literal["new", "in_progress", "closed"]


class NewInquiry(BaseModel):
    """The body of POST /api/inquiries, sent by the public site's anonymous form."""

    # The course's number from shared/courses.csv; 0 is the general row (כללי). Stored as course_number.
    course_id: int = Field(ge=0)
    type: InquiryType
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    # Honeypot: a hidden field a person never fills. Not stored; the route drops the inquiry when it is set.
    website: Annotated[str, StringConstraints(max_length=2000)] = ""
    # Optional here only so the honeypot check runs first; the route rejects a missing token with 422.
    # Cloudflare tokens are at most 2048 characters, so a longer one is rejected without a network call.
    turnstile_token: Annotated[str, StringConstraints(max_length=2048)] | None = None


class InquiryUpdate(BaseModel):
    """The body of POST /api/admin/inquiries/{id}. Send only what changes: a field left out stays as it is.
    internal_note "" or null clears the note. At least one field is required (the route checks)."""

    status: InquiryStatus | None = None
    internal_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None