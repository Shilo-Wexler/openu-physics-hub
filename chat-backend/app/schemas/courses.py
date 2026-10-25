"""Request bodies of the course routes."""

from pydantic import BaseModel, Field


class Rating(BaseModel):
    difficulty: int = Field(ge=1, le=5)
    recommendation: int = Field(ge=1, le=5)
