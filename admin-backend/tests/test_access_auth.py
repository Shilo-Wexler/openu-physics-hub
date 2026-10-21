"""Console sign-in through Cloudflare Access: what the JWT check accepts and refuses."""

import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.exceptions import PyJWKClientConnectionError

from app import auth
from conftest import ADMIN_EMAIL, ACCESS_KEY_ID, access_token, bearer

ME = "/api/admin/me"


def me(client, token: str):
    return client.get(ME, headers={auth.ACCESS_HEADER: token})


def test_valid_token_signs_in(client):
    response = me(client, access_token(ADMIN_EMAIL))
    assert (response.status_code, response.json()["email"]) == (200, ADMIN_EMAIL)


def test_email_is_lowercased(client):
    assert me(client, access_token("Admin@Test.com")).json()["email"] == ADMIN_EMAIL


def test_missing_header(client):
    response = client.get(ME)
    assert (response.status_code, response.json()) == (401, {"detail": "missing access token"})


def test_google_token_is_no_longer_accepted(client):
    assert client.get(ME, headers=bearer(ADMIN_EMAIL)).status_code == 401


def test_expired_token(client):
    now = int(time.time())
    assert me(client, access_token(ADMIN_EMAIL, iat=now - 7200, exp=now - 3600)).status_code == 401


def test_small_clock_skew_is_tolerated(client):
    assert me(client, access_token(ADMIN_EMAIL, exp=int(time.time()) - 5)).status_code == 200


def test_token_for_another_access_application(client):
    assert me(client, access_token(ADMIN_EMAIL, aud=["another-app"])).status_code == 401


def test_token_from_another_team(client):
    assert me(client, access_token(ADMIN_EMAIL, iss="https://evil.cloudflareaccess.com")).status_code == 401


def test_token_signed_with_another_key(client):
    """Same key id, wrong key: someone forging the header without Cloudflare's private key."""
    forger = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert me(client, access_token(ADMIN_EMAIL, key=forger)).status_code == 401


def test_token_with_unknown_key_id(client):
    token = jwt.decode(access_token(ADMIN_EMAIL), options={"verify_signature": False})
    from conftest import ACCESS_KEY
    forged = jwt.encode(token, ACCESS_KEY, algorithm="RS256", headers={"kid": "other-key"})
    assert me(client, forged).status_code == 401


def test_only_rs256_is_accepted(client):
    """An HMAC token signed with a guessed secret must not pass, even with the right key id."""
    claims = jwt.decode(access_token(ADMIN_EMAIL), options={"verify_signature": False})
    forged = jwt.encode(claims, "x" * 32, algorithm="HS256", headers={"kid": ACCESS_KEY_ID})
    assert me(client, forged).status_code == 401


def test_token_without_email(client):
    assert me(client, access_token(None)).status_code == 401


def test_garbage_token(client):
    assert me(client, "not-a-token").status_code == 401


def test_keys_unavailable_is_503(client, monkeypatch):
    class Down:
        def get_signing_key_from_jwt(self, token):
            raise PyJWKClientConnectionError("cloudflare is down")

    monkeypatch.setattr(auth, "_jwks_client", Down())
    response = me(client, access_token(ADMIN_EMAIL))
    assert (response.status_code, response.json()) == (503, {"detail": "sign-in keys unavailable"})


def test_not_configured_refuses_everyone(client, monkeypatch):
    monkeypatch.setattr(auth, "CF_ACCESS_AUD", None)
    response = me(client, access_token(ADMIN_EMAIL))
    assert (response.status_code, response.json()) == (401, {"detail": "cloudflare access is not configured"})
    