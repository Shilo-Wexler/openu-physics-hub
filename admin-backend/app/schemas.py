"""Input models. Lengths match the DB checks: each section names the matching migration in db/migrations/."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

# Admin levels: db/migrations/004_admin_roles.sql.
Role = Literal["super_admin", "admin", "member"]


class AdminRole(BaseModel):
    role: Role


class NewAdmin(BaseModel):
    email: Annotated[
        str,
        StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$"),
    ]
    # Least privilege by default: a committee member.
    role: Role = "member"


# Announcements: lengths match db/migrations/005_announcements.sql.

class AnnouncementIn(BaseModel):
    """Creating or editing an announcement: always the whole text, so the console sends what it shows.
    Publishing, pinning and the image each have their own route (/api/admin/announcements/{id}/...).
    Both fields may be empty ("" means none): a published announcement needs only one of title, text
    or image, and the routes that publish or change a published one check that."""

    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    # Plain text.
    body: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)] = ""


# What an image upload must say about the picture, for screen readers (?alt= on the upload).
ImageAlt = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


# Inquiries: lengths and values match db/migrations/006_inquiries.sql.

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
    