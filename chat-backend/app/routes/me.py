"""The signed-in user's own profile."""

from typing import Annotated
from uuid import UUID

from app.routes.deps import clear_session_cookie, current_user_id, http_errors
from app.schemas.me import AvatarChange, NicknameChange
from app.services import users
from fastapi import APIRouter, Depends, Response

router = APIRouter(prefix="/me", tags=["me"])

_ERRORS = {
    users.InvalidNickname: (422, "nickname must be 3-30 letters, digits, spaces, _ - ."),
    users.NicknameTaken: (409, "nickname taken"),
    users.InvalidAvatar: (422, "unknown avatar"),
    users.UserBlocked: (403, "user is blocked"),
}


@router.get("")
async def me(user_id: Annotated[UUID, Depends(current_user_id)]):
    user = await users.get(user_id)
    return {"user_id": user["id"], "nickname": user["nickname"], "avatar": user["avatar"]}


@router.put("/nickname")
async def change_nickname(
    body: NicknameChange, user_id: Annotated[UUID, Depends(current_user_id)]
):
    with http_errors(_ERRORS):
        nickname = await users.set_nickname(user_id, body.nickname)
    return {"nickname": nickname}


@router.put("/avatar")
async def change_avatar(body: AvatarChange, user_id: Annotated[UUID, Depends(current_user_id)]):
    with http_errors(_ERRORS):
        avatar = await users.set_avatar(user_id, body.avatar)
    return {"avatar": avatar}


@router.delete("", status_code=204)
async def delete_account(response: Response, user_id: Annotated[UUID, Depends(current_user_id)]):
    """Ask to delete the account. It is deleted a week later unless the user signs in again."""
    await users.request_deletion(user_id)
    clear_session_cookie(response)