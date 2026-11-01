"""Inquiry input models. Lengths and values match db/migrations/006_inquiries.sql and 008_inquiry_contact.sql."""

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator

InquiryType = Literal["exams", "staff", "accessibility", "admin", "other"]
InquiryStatus = Literal["new", "in_progress", "closed"]

# What people type between the digits of a phone number. Dropped before the check,
# so only digits (and a leading +) are stored.
_PHONE_SEPARATORS = re.compile(r"[\s\-().]")
# 7 to 15 digits: 15 is the international maximum (E.164).
_PHONE = re.compile(r"\+?[0-9]{7,15}")
# Only the basic shape (something@something.something), as in the DB check.
# A stricter pattern starts rejecting real addresses.
_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def _normalize_phone(value: str) -> str:
    value = _PHONE_SEPARATORS.sub("", value)
    if not _PHONE.fullmatch(value):
        raise ValueError("invalid phone number")
    return value


def _normalize_email(value: str) -> str:
    value = value.lower()
    if not _EMAIL.fullmatch(value):
        raise ValueError("invalid email address")
    return value


ContactName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
# Up to 30 characters as typed, room for separators around 15 digits.
ContactPhone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=30), AfterValidator(_normalize_phone)]
ContactEmail = Annotated[str, StringConstraints(strip_whitespace=True, max_length=254), AfterValidator(_normalize_email)]


class NewInquiry(BaseModel):
    """The body of POST /api/inquiries, sent by the public site's inquiry form."""

    # The course's number from shared/courses.csv; 0 is the general row (כללי). Stored as course_number.
    course_id: int = Field(ge=0)
    type: InquiryType
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    # Not stored: an inquiry without contact details is anonymous. The route checks that it agrees with
    # the contact fields (anonymous: none of them; not anonymous: a phone or an email). True when left out.
    anonymous: bool = True
    # Optional contact details; an empty or blank value counts as not given. The name never comes alone.
    contact_name: ContactName | None = None
    contact_phone: ContactPhone | None = None
    contact_email: ContactEmail | None = None
    # Honeypot: a hidden field a person never fills. Not stored; the route drops the inquiry when it is set.
    website: Annotated[str, StringConstraints(max_length=2000)] = ""
    # Optional here only so the honeypot check runs first; the route rejects a missing token with 422.
    # Cloudflare tokens are at most 2048 characters, so a longer one is rejected without a network call.
    turnstile_token: Annotated[str, StringConstraints(max_length=2048)] | None = None

    @field_validator("contact_name", "contact_phone", "contact_email", mode="before")
    @classmethod
    def _blank_is_missing(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def has_contact(self) -> bool:
        """Any contact detail at all, the name included."""
        return any((self.contact_name, self.contact_phone, self.contact_email))

    @property
    def reachable(self) -> bool:
        """A way to reply: a phone or an email. A name alone is not one."""
        return bool(self.contact_phone or self.contact_email)


class InquiryUpdate(BaseModel):
    """The body of POST /api/admin/inquiries/{id}. Send only what changes: a field left out stays as it is.
    internal_note "" or null clears the note. At least one field is required (the route checks)."""

    status: InquiryStatus | None = None
    internal_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    