"""Input models. Lengths match the DB checks in db/migrations/001_init.sql."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

# STUDENT-SIDE: the body of POST /api/requests.
class NewRequest(BaseModel):
    id_token: str
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254)]
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    course_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class BlockEmail(BaseModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254)]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None


Role = Literal["admin", "moderator", "inquiries", "announcements"]

# The two levels the console offers. "admin" alone means everything, including managing admins.
FULL_ADMIN_ROLES: list[Role] = ["admin"]
STANDARD_ROLES: list[Role] = ["announcements", "inquiries", "moderator"]


class AdminRoles(BaseModel):
    roles: list[Role] = Field(min_length=1)

    @field_validator("roles")
    @classmethod
    def _dedupe(cls, roles: list[str]) -> list[str]:
        return sorted(set(roles))


class NewAdmin(BaseModel):
    email: Annotated[
        str,
        StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$"),
    ]
    # Least privilege by default: everything except managing admins.
    roles: list[Role] = Field(default_factory=lambda: list(STANDARD_ROLES), min_length=1)

    @field_validator("roles")
    @classmethod
    def _dedupe(cls, roles: list[str]) -> list[str]:
        return sorted(set(roles))
