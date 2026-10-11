"""Sign-in, the user's own profile, nickname and avatar changes, and sign-out."""

import re

from app.services import google_auth
from app.services.users import AVATARS
from conftest import Student


def test_sign_in_creates_user_with_random_nickname_and_avatar(sign_in):
    alice = sign_in("alice")
    response = alice.get("/me")
    assert response.status_code == 200
    assert response.json()["user_id"] == alice.user_id
    assert re.fullmatch(r"student\d{6}", response.json()["nickname"])
    assert response.json()["avatar"] in AVATARS


def test_same_google_account_is_same_user(sign_in):
    assert sign_in("alice").user_id == sign_in("alice").user_id
    assert sign_in("alice").user_id != sign_in("bob").user_id


def test_invalid_google_token_is_rejected(guest, monkeypatch):
    async def reject(token: str) -> str:
        raise google_auth.InvalidGoogleToken("bad")

    monkeypatch.setattr(google_auth, "verify_id_token", reject)
    assert guest.post("/auth/google", json={"id_token": "x"}).status_code == 401


def test_guest_and_unknown_session_get_401(client, guest):
    assert guest.get("/me").status_code == 401
    assert Student(client, token="not-a-real-session").get("/me").status_code == 401


def test_change_nickname(sign_in):
    alice = sign_in("alice")
    response = alice.put("/me/nickname", json={"nickname": "Alice_1"})
    assert response.status_code == 200
    assert alice.get("/me").json()["nickname"] == "Alice_1"


def test_invalid_nickname_is_rejected(sign_in):
    alice = sign_in("alice")
    for nickname in ["ab", "x" * 31, "bad!name"]:
        assert alice.put("/me/nickname", json={"nickname": nickname}).status_code == 422


def test_nickname_taken_ignores_case(sign_in):
    sign_in("alice").put("/me/nickname", json={"nickname": "Alice"})
    assert sign_in("bob").put("/me/nickname", json={"nickname": "ALICE"}).status_code == 409


def test_change_avatar(sign_in):
    alice = sign_in("alice")
    assert alice.put("/me/avatar", json={"avatar": "rocket"}).json() == {"avatar": "rocket"}
    assert alice.get("/me").json()["avatar"] == "rocket"
    assert alice.put("/me/avatar", json={"avatar": "einstein"}).status_code == 422


def test_logout_ends_only_this_session(sign_in):
    laptop = sign_in("alice")
    phone = sign_in("alice")
    assert laptop.post("/auth/logout").status_code == 200
    assert laptop.get("/me").status_code == 401
    assert phone.get("/me").status_code == 200


def test_logout_all_ends_every_session(sign_in):
    laptop = sign_in("alice")
    phone = sign_in("alice")
    assert laptop.post("/auth/logout-all").status_code == 200
    assert laptop.get("/me").status_code == 401
    assert phone.get("/me").status_code == 401