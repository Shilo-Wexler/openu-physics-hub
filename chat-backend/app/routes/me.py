"""The signed-in user's own profile."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routes.deps import current_user_id
from app.services import users

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def me(user_id: Annotated[UUID, Depends(current_user_id)]):
    user = await users.get(user_id)
    return {"user_id": user["id"], "nickname": user["nickname"]}


class NicknameChange(BaseModel):
    nickname: str


@router.put("/nickname")
async def change_nickname(
    body: NicknameChange, user_id: Annotated[UUID, Depends(current_user_id)]
):
    try:
        nickname = await users.set_nickname(user_id, body.nickname)
    except users.InvalidNickname:
        raise HTTPException(
            status_code=422, detail="nickname must be 3-30 letters, digits, spaces, _ - ."
        )
    except users.NicknameTaken:
        raise HTTPException(status_code=409, detail="nickname taken")
    except PermissionError:
        raise HTTPException(status_code=403, detail="user is blocked")
    return {"nickname": nickname}