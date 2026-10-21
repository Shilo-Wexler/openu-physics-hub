"""/api/admin: access, lists, read/unread/close/delete, stats, blocking, courses."""

import pytest

from conftest import ADMIN_EMAIL, STUDENT_EMAIL, access, bearer, courses_from_csv, run_sql

MISSING = 999999


# ---------- Access ----------

@pytest.mark.parametrize(
    "headers, status",
    [
        ({}, 401),                                         # no token
        ({"Authorization": "Basic abc"}, 401),             # wrong scheme
        ({"Cf-Access-Jwt-Assertion": "not-a-token"}, 401),                      # not a valid JWT
        (access(STUDENT_EMAIL), 403),                      # valid, but not an admin
    ],
)
def test_access(client, headers, status):
    assert client.get("/api/admin/summary", headers=headers).status_code == status


def test_dev_bypass_only_when_enabled(client, monkeypatch):
    # Off (the default in tests): "dev" is just an invalid token.
    assert client.get("/api/admin/summary", headers=bearer("dev")).status_code == 401
    monkeypatch.setattr("app.auth.DEV_AUTH_EMAIL", ADMIN_EMAIL)
    assert client.get("/api/admin/summary", headers=bearer("dev")).status_code == 200
    # dev:<email> acts as that email, which still has to be an admin.
    assert client.get("/api/admin/summary", headers=bearer(f"dev:{STUDENT_EMAIL}")).status_code == 403


def test_me(admin, client):
    assert admin("GET", "/me").json() == {"email": ADMIN_EMAIL, "name": None, "roles": ["admin"]}
    assert client.get("/api/admin/me", headers=access(STUDENT_EMAIL)).status_code == 403


# ---------- Lists and single request ----------

def test_summary(admin, add_request):
    for i in range(3):
        add_request(body=f"פנייה {i}")
    ids = [r["id"] for r in admin("GET", "/requests/unread").json()]
    admin("POST", f"/requests/{ids[0]}/read")
    admin("POST", f"/requests/{ids[1]}/read")
    admin("POST", f"/requests/{ids[1]}/close")
    assert admin("GET", "/summary").json() == {"unread": 1, "in_progress": 1, "closed": 1, "total": 3}


def test_unread_and_read_lists(admin, add_request):
    add_request(body="ראשונה")
    add_request(body="שנייה")
    unread = admin("GET", "/requests/unread").json()
    assert [r["preview"] for r in unread] == ["ראשונה", "שנייה"]  # oldest first
    admin("POST", f"/requests/{unread[0]['id']}/read")
    assert [r["preview"] for r in admin("GET", "/requests/unread").json()] == ["שנייה"]
    assert [r["preview"] for r in admin("GET", "/requests/read").json()] == ["ראשונה"]


def test_list_preview_is_short(admin, add_request):
    add_request(body="א" * 1000)
    assert len(admin("GET", "/requests/unread").json()[0]["preview"]) == 200


def test_get_request(admin, new_request):
    body = admin("GET", f"/requests/{new_request}").json()
    assert body["body"] == "פנייה לבדיקה"
    assert body["email"] == STUDENT_EMAIL
    assert admin("GET", f"/requests/{MISSING}").status_code == 404


def test_list_filters_and_paging(admin, add_request):
    add_request(body="1", course_name="מכניקה")
    add_request(body="2", course_name="כללי")
    add_request(body="3", course_name="כללי", email="b@test.com")

    def items(**params):
        return admin("GET", "/requests", params=params).json()

    assert items()["total"] == 3
    assert [r["preview"] for r in items()["items"]] == ["3", "2", "1"]  # newest first
    assert [r["preview"] for r in items(sort="oldest")["items"]] == ["1", "2", "3"]
    assert items(course_name="כללי")["total"] == 2
    assert items(email="B@Test.com")["total"] == 1  # email filter is case-insensitive
    assert items(is_opened="false")["total"] == 3
    assert items(status="closed")["total"] == 0

    page = items(page_size=2, page=2)
    assert (page["total"], len(page["items"]), page["page"]) == (3, 1, 2)


@pytest.mark.parametrize(
    "params", [{"page_size": 1000}, {"page": 0}, {"sort": "name"}, {"status": "pending"}]
)
def test_list_rejects_bad_params(admin, params):
    assert admin("GET", "/requests", params=params).status_code == 422


# ---------- State changes ----------

def test_read_unread_close_flow(admin, new_request):
    path = f"/requests/{new_request}"
    assert admin("POST", f"{path}/close").status_code == 409          # must be read first
    assert admin("POST", f"{path}/read").json()["is_opened"] is True
    assert admin("POST", f"{path}/unread").json()["is_opened"] is False
    admin("POST", f"{path}/read")
    assert admin("POST", f"{path}/close").json()["status"] == "closed"
    assert admin("POST", f"{path}/unread").status_code == 409         # closed stays read
    reopened = admin("POST", f"{path}/reopen").json()
    assert (reopened["status"], reopened["is_opened"]) == ("new", True)  # back to "in progress"
    assert admin("GET", "/summary").json() == {"unread": 0, "in_progress": 1, "closed": 0, "total": 1}
    assert admin("POST", f"{path}/reopen").json()["status"] == "new"   # repeating changes nothing
    assert admin("POST", f"{path}/unread").json()["is_opened"] is False  # open again, so unread is allowed


@pytest.mark.parametrize("action", ["read", "unread", "close", "reopen"])
def test_state_change_on_missing_request(admin, action):
    assert admin("POST", f"/requests/{MISSING}/{action}").status_code == 404


def test_delete(admin, new_request):
    assert admin("DELETE", f"/requests/{new_request}").status_code == 204
    assert admin("GET", f"/requests/{new_request}").status_code == 404
    assert admin("DELETE", f"/requests/{new_request}").status_code == 404
    assert run_sql("select count(*) from requests") == [(0,)]


# ---------- Stats ----------

def test_stats_by_course(admin, add_request):
    add_request(body="1")
    add_request(body="2")
    rows = {r["course_name"]: r for r in admin("GET", "/stats/by-course").json()}
    assert len(rows) == len(courses_from_csv())  # every active course, also with zero
    assert (rows["מכניקה"]["total"], rows["מכניקה"]["unread"]) == (2, 2)
    assert rows["כללי"]["total"] == 0


def test_stats_by_course_date_range(admin, add_request):
    add_request()
    run_sql("update requests set created_at = '2025-01-15'")
    in_range = admin("GET", "/stats/by-course", params={"date_from": "2025-01-01T00:00:00", "date_to": "2025-02-01T00:00:00"})
    out_of_range = admin("GET", "/stats/by-course", params={"date_from": "2026-01-01T00:00:00"})
    assert {r["course_name"]: r["total"] for r in in_range.json()}["מכניקה"] == 1
    assert {r["course_name"]: r["total"] for r in out_of_range.json()}["מכניקה"] == 0


def test_stats_weekly(admin, add_request):
    add_request(body="השבוע")
    add_request(body="לפני שבועיים")
    run_sql("update requests set created_at = now() - interval '14 days' where body = 'לפני שבועיים'")
    weeks = admin("GET", "/stats/weekly", params={"weeks": 4}).json()
    assert len(weeks) == 4                       # empty weeks are included
    assert [w["total"] for w in weeks] == [0, 1, 0, 1]
    one_course = admin("GET", "/stats/weekly", params={"weeks": 4, "course_name": "כללי"}).json()
    assert sum(w["total"] for w in one_course) == 0


def test_top_senders(admin, add_request):
    for i in range(3):
        add_request(body=f"פנייה {i}")
    add_request(email="b@test.com")
    admin("POST", "/blocked", json={"email": STUDENT_EMAIL})
    top = admin("GET", "/stats/top-senders").json()
    assert [(t["email"], t["total"], t["is_blocked"]) for t in top] == [
        (STUDENT_EMAIL, 3, True),
        ("b@test.com", 1, False),
    ]


# ---------- Blocking and courses ----------

@pytest.mark.student
def test_block_and_unblock(admin, submit):
    """STUDENT-SIDE cross-check: a block made in the console stops POST /api/requests."""
    created = admin("POST", "/blocked", json={"email": " Student@Test.com ", "reason": "spam"})
    assert created.status_code == 201
    assert created.json()["email"] == STUDENT_EMAIL  # trimmed and lowercased
    assert [b["email"] for b in admin("GET", "/blocked").json()] == [STUDENT_EMAIL]
    assert submit().status_code == 403

    assert admin("DELETE", f"/blocked/{STUDENT_EMAIL}").status_code == 204
    assert admin("GET", "/blocked").json() == []
    assert submit().status_code == 201
    assert admin("DELETE", f"/blocked/{STUDENT_EMAIL}").status_code == 404


def test_block_twice_updates_reason(admin):
    admin("POST", "/blocked", json={"email": STUDENT_EMAIL, "reason": "first"})
    admin("POST", "/blocked", json={"email": STUDENT_EMAIL, "reason": "second"})
    assert [b["reason"] for b in admin("GET", "/blocked").json()] == ["second"]


def test_hebrew_response_has_utf8_charset(client):
    response = client.get("/api/admin/courses", headers=access(ADMIN_EMAIL))
    assert "charset=utf-8" in response.headers["content-type"]
    assert "כללי" in [c["name"] for c in response.json()]


def test_courses(admin):
    courses = admin("GET", "/courses").json()
    assert len(courses) == len(courses_from_csv())
    assert courses[0] == {"name": "כללי", "course_number": 0}  # "general" first
