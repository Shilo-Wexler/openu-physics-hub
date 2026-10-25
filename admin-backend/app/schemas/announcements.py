"""Announcement input models. Lengths match db/migrations/005_announcements.sql."""

from typing import Annotated

from pydantic import BaseModel, StringConstraints


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