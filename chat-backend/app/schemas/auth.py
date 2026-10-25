"""Request bodies of the sign-in routes."""

from pydantic import BaseModel


class GoogleSignIn(BaseModel):
    id_token: str
