"""Request bodies of the message routes."""

from pydantic import BaseModel


class NewMessage(BaseModel):
    content: str
    reply_to_id: int | None = None


class MessageEdit(BaseModel):
    content: str
