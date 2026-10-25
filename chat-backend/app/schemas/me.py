"""Request bodies of the profile routes."""

from pydantic import BaseModel


class NicknameChange(BaseModel):
    nickname: str


class AvatarChange(BaseModel):
    avatar: str
