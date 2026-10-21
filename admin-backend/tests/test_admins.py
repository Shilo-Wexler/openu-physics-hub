"""/api/admin/admins and the two levels:
"מנהל ראשי" = roles {admin}: everything, including adding, changing and removing admins.
"מנהל" = roles {announcements, inquiries, moderator}: everything except managing admins.
"""

import pytest

from conftest import ADMIN_EMAIL, STUDENT_EMAIL, access, run_sql

NEW = "new.admin@test.com"
STAFF = "staff@test.com"
STANDARD = ["announcements", "inquiries", "moderator"]


@pytest.fixture
def staff(client):
    """A standard admin (everything except managing admins), and a caller for them."""
    run_sql("insert into admins (email, roles, added_by) values (%s, %s, %s)", (STAFF, STANDARD, ADMIN_EMAIL))

    def _call(method, path, **kwargs):
        return client.request(method, f"/api/admin{path}", headers=access(STAFF), **kwargs)

    return _call


def admins(admin):
    return {a["email"]: a["roles"] for a in admin("GET", "/admins").json()}


# ---------- Listing and /me ----------

def test_first_admin_added_in_the_db_is_a_full_admin(admin):
    rows = admin("GET", "/admins").json()
    assert rows == [{"email": ADMIN_EMAIL, "roles": ["admin"], "added_by": None, "created_at": rows[0]["created_at"]}]


def test_me_returns_the_roles(admin, staff):
    assert admin("GET", "/me").json()["roles"] == ["admin"]
    assert staff("GET", "/me").json()["roles"] == STANDARD


def test_standard_admin_can_see_the_list(staff):
    assert set(a["email"] for a in staff("GET", "/admins").json()) == {ADMIN_EMAIL, STAFF}


# ---------- A standard admin can do everything else ----------

@pytest.mark.parametrize(
    "method, path",
    [
        ("GET", "/summary"),
        ("GET", "/requests"),
        ("GET", "/requests/unread"),
        ("GET", "/stats/by-course"),
        ("GET", "/stats/weekly"),
        ("GET", "/stats/top-senders"),
        ("GET", "/blocked"),
        ("GET", "/courses"),
        ("GET", "/chat/actions"),
    ],
)
def test_standard_admin_has_access_to_everything_else(staff, method, path):
    assert staff(method, path).status_code == 200


def test_standard_admin_can_handle_requests_and_blocks(staff, add_request):
    request_id = add_request()
    assert staff("POST", f"/requests/{request_id}/read").status_code == 200
    assert staff("POST", f"/requests/{request_id}/close").status_code == 200
    assert staff("POST", f"/requests/{request_id}/reopen").status_code == 200
    assert staff("POST", "/blocked", json={"email": "spam@test.com"}).status_code == 201
    assert staff("DELETE", f"/requests/{request_id}").status_code == 204


# ---------- ...but cannot manage admins ----------

@pytest.mark.parametrize(
    "method, path, body",
    [
        ("POST", "/admins", {"email": NEW}),
        ("PUT", f"/admins/{ADMIN_EMAIL}/roles", {"roles": STANDARD}),
        ("DELETE", f"/admins/{ADMIN_EMAIL}", None),
    ],
)
def test_standard_admin_cannot_manage_admins(staff, admin, method, path, body):
    response = staff(method, path, json=body)
    assert (response.status_code, response.json()) == (403, {"detail": "requires the admin role"})
    assert admins(admin) == {ADMIN_EMAIL: ["admin"], STAFF: STANDARD}


# ---------- Adding ----------

def test_add_defaults_to_the_standard_level(admin):
    response = admin("POST", "/admins", json={"email": NEW})
    assert response.status_code == 201
    assert response.json()["roles"] == STANDARD
    assert response.json()["added_by"] == ADMIN_EMAIL


def test_add_a_full_admin(admin):
    assert admin("POST", "/admins", json={"email": NEW, "roles": ["admin"]}).json()["roles"] == ["admin"]


def test_roles_are_deduplicated_and_sorted(admin):
    roles = admin("POST", "/admins", json={"email": NEW, "roles": ["moderator", "inquiries", "moderator"]}).json()["roles"]
    assert roles == ["inquiries", "moderator"]


@pytest.mark.parametrize("roles", [[], ["owner"], "admin"])
def test_invalid_roles_are_rejected(admin, roles):
    assert admin("POST", "/admins", json={"email": NEW, "roles": roles}).status_code == 422
    assert NEW not in admins(admin)


def test_added_admin_gets_access_at_once(admin, client):
    assert client.get("/api/admin/me", headers=access(NEW)).status_code == 403
    admin("POST", "/admins", json={"email": NEW})
    assert client.get("/api/admin/me", headers=access(NEW)).status_code == 200


def test_a_full_admin_added_in_the_console_can_add_another(admin, client):
    admin("POST", "/admins", json={"email": NEW, "roles": ["admin"]})
    response = client.post("/api/admin/admins", headers=access(NEW), json={"email": "third@test.com"})
    assert (response.status_code, response.json()["added_by"]) == (201, NEW)


def test_email_is_normalized(admin):
    admin("POST", "/admins", json={"email": "  New.Admin@Test.COM "})
    assert NEW in admins(admin)


def test_duplicate_is_rejected(admin):
    admin("POST", "/admins", json={"email": NEW})
    response = admin("POST", "/admins", json={"email": NEW.upper(), "roles": ["admin"]})
    assert (response.status_code, response.json()) == (409, {"detail": "already an admin"})
    assert admins(admin)[NEW] == STANDARD  # the existing level did not change


@pytest.mark.parametrize("bad", ["", "not-an-email", "a b@test.com", "x" * 250 + "@t.co"])
def test_invalid_email_is_rejected(admin, bad):
    assert admin("POST", "/admins", json={"email": bad}).status_code == 422
    assert list(admins(admin)) == [ADMIN_EMAIL]


# ---------- Changing the level ----------

def test_promote_and_demote(admin, client):
    admin("POST", "/admins", json={"email": NEW})
    assert client.post("/api/admin/admins", headers=access(NEW), json={"email": "x@test.com"}).status_code == 403
    assert admin("PUT", f"/admins/{NEW}/roles", json={"roles": ["admin"]}).json()["roles"] == ["admin"]
    assert client.post("/api/admin/admins", headers=access(NEW), json={"email": "x@test.com"}).status_code == 201
    assert admin("PUT", f"/admins/{NEW.upper()}/roles", json={"roles": STANDARD}).json()["roles"] == STANDARD
    assert client.delete("/api/admin/admins/x@test.com", headers=access(NEW)).status_code == 403


def test_cannot_change_your_own_roles(admin):
    response = admin("PUT", f"/admins/{ADMIN_EMAIL}/roles", json={"roles": STANDARD})
    assert (response.status_code, response.json()) == (409, {"detail": "you cannot change your own roles"})
    assert admins(admin)[ADMIN_EMAIL] == ["admin"]


def test_change_unknown_admin(admin):
    assert admin("PUT", "/admins/nobody@test.com/roles", json={"roles": STANDARD}).status_code == 404


def test_change_to_invalid_roles(admin, staff):
    assert admin("PUT", f"/admins/{STAFF}/roles", json={"roles": []}).status_code == 422
    assert admins(admin)[STAFF] == STANDARD


# ---------- Removing ----------

def test_remove_takes_access_away_at_once(admin, client):
    admin("POST", "/admins", json={"email": NEW})
    assert admin("DELETE", f"/admins/{NEW}").status_code == 204
    assert NEW not in admins(admin)
    assert client.get("/api/admin/me", headers=access(NEW)).status_code == 403


def test_remove_is_case_insensitive(admin):
    admin("POST", "/admins", json={"email": NEW})
    assert admin("DELETE", f"/admins/{NEW.upper()}").status_code == 204


def test_cannot_remove_yourself(admin):
    response = admin("DELETE", f"/admins/{ADMIN_EMAIL}")
    assert (response.status_code, response.json()) == (409, {"detail": "you cannot remove yourself"})
    assert list(admins(admin)) == [ADMIN_EMAIL]


def test_remove_unknown(admin):
    assert admin("DELETE", "/admins/nobody@test.com").status_code == 404


@pytest.mark.parametrize("method, path", [("GET", "/admins"), ("POST", "/admins"), ("DELETE", f"/admins/{ADMIN_EMAIL}")])
def test_non_admin_cannot_manage_admins(client, method, path):
    response = client.request(method, f"/api/admin{path}", headers=access(STUDENT_EMAIL), json={"email": NEW})
    assert response.status_code == 403
    assert run_sql("select email from admins") == [(ADMIN_EMAIL,)]
