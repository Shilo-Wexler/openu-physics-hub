"""Admin input models. Levels and name length match db/migrations/004_admin_roles.sql."""

from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

Role = Literal["super_admin", "admin", "member"]
AdminName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]


class AdminRole(BaseModel):
    role: Role


class AdminNameIn(BaseModel):
    name: AdminName


class NewAdmin(BaseModel):
    email: Annotated[
        str,
        StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$"),
    ]
    name: AdminName
    # Least privilege by default: a committee member.
    role: Role = "member"