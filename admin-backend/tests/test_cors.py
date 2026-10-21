"""CORS preflight: the console's origin may use exactly the methods the API needs."""

ORIGIN = "http://localhost:5173"  # ALLOWED_ORIGINS in conftest
ROLES_PATH = "/api/admin/admins/someone@test.com/roles"


def preflight(client, method: str):
    return client.options(
        ROLES_PATH,
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )


def test_preflight_allows_put(client):
    r = preflight(client, "PUT")
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGIN
    assert "PUT" in r.headers["access-control-allow-methods"]


def test_preflight_refuses_unused_methods(client):
    r = preflight(client, "PATCH")
    assert r.status_code == 400
    