"""Console inquiries, /api/admin/inquiries: who may use them, the list and its filters, paging, counts,
one inquiry, and status / note changes."""

import pytest

from app.routes import inquiries
from conftest import ADMIN_EMAIL, run_sql

ITEM_KEYS = {
    "id", "course_number", "course_name", "type", "content", "status",
    "handled_by", "internal_note", "created_at", "updated_at",
}

# Every console route, as (method, path, json). Used by the access tests.
ROUTES = [
    ("GET", "/api/admin/inquiries", None),
    ("GET", "/api/admin/inquiries/counts", None),
    ("GET", "/api/admin/inquiries/1", None),
    ("POST", "/api/admin/inquiries/1", {"status": "closed"}),
]


def ids(response) -> list[int]:
    return [item["id"] for item in response.json()["items"]]


def row_of(inquiry_id: int) -> tuple:
    return run_sql(
        "select status, handled_by, internal_note from inquiries where id = %s", (inquiry_id,)
    )[0]


# Access


@pytest.mark.parametrize(("method", "path", "body"), ROUTES)
def test_no_sign_in_is_401(client, add_inquiry, method, path, body):
    add_inquiry()
    assert client.request(method, path, json=body).status_code == 401


@pytest.mark.parametrize(("method", "path", "body"), ROUTES)
def test_other_roles_are_403(client, add_inquiry, admin_with_roles, method, path, body):
    add_inquiry()
    headers = admin_with_roles("announcements", "moderator")
    r = client.request(method, path, json=body, headers=headers)
    assert r.status_code == 403
    assert r.json() == {"detail": "requires the inquiries role"}


@pytest.mark.parametrize(("method", "path", "body"), ROUTES)
def test_inquiries_role_may_use_every_route(client, add_inquiry, admin_with_roles, method, path, body):
    add_inquiry()
    headers = admin_with_roles("inquiries")
    assert client.request(method, path, json=body, headers=headers).status_code == 200


# The list


def test_empty_list(admin):
    r = admin("GET", "/inquiries")
    assert r.status_code == 200
    assert r.json() == {"items": [], "next_before": None}


def test_list_is_newest_first(admin, add_inquiry):
    first, second, third = add_inquiry(), add_inquiry(), add_inquiry()
    assert ids(admin("GET", "/inquiries")) == [third, second, first]


def test_item_shape_includes_course_name(admin, add_inquiry):
    add_inquiry(content="Hello")
    item = admin("GET", "/inquiries").json()["items"][0]
    assert set(item) == ITEM_KEYS
    general_name = run_sql("select name from courses where course_number = 0")[0][0]
    assert item["course_number"] == 0
    assert item["course_name"] == general_name
    assert item["content"] == "Hello"
    assert item["status"] == "new"
    assert item["handled_by"] is None


def test_filter_by_status(admin, add_inquiry):
    add_inquiry(status="new")
    closed = add_inquiry(status="closed")
    assert ids(admin("GET", "/inquiries", params={"status": "closed"})) == [closed]


def test_filter_by_type(admin, add_inquiry):
    add_inquiry(type="exams")
    staff = add_inquiry(type="staff")
    assert ids(admin("GET", "/inquiries", params={"type": "staff"})) == [staff]


def test_filter_by_course(admin, add_inquiry):
    course = run_sql("select course_number from courses where course_number <> 0 limit 1")[0][0]
    add_inquiry(course_number=0)
    on_course = add_inquiry(course_number=course)
    assert ids(admin("GET", "/inquiries", params={"course": course})) == [on_course]


def test_filters_combine(admin, add_inquiry):
    add_inquiry(status="new", type="exams")
    add_inquiry(status="closed", type="staff")
    match = add_inquiry(status="closed", type="exams")
    assert ids(admin("GET", "/inquiries", params={"status": "closed", "type": "exams"})) == [match]


@pytest.mark.parametrize(
    ("params", "detail"),
    [
        ({"status": "open"}, "invalid status"),
        ({"type": "spam"}, "invalid type"),
        ({"course": -1}, "invalid course"),
        ({"before": 0}, "invalid before"),
        ({"before": "abc"}, "invalid before"),
    ],
)
def test_invalid_filters(admin, params, detail):
    r = admin("GET", "/inquiries", params=params)
    assert r.status_code == 422
    assert r.json() == {"detail": detail}


def test_paging(admin, add_inquiry, monkeypatch):
    monkeypatch.setattr(inquiries, "CONSOLE_PAGE_SIZE", 2)
    made = [add_inquiry() for _ in range(5)]
    newest_first = made[::-1]

    page = admin("GET", "/inquiries").json()
    assert [i["id"] for i in page["items"]] == newest_first[0:2]
    assert page["next_before"] == newest_first[1]

    page = admin("GET", "/inquiries", params={"before": page["next_before"]}).json()
    assert [i["id"] for i in page["items"]] == newest_first[2:4]

    page = admin("GET", "/inquiries", params={"before": page["next_before"]}).json()
    assert [i["id"] for i in page["items"]] == newest_first[4:5]
    assert page["next_before"] is None


def test_exactly_one_full_page_has_no_next(admin, add_inquiry, monkeypatch):
    monkeypatch.setattr(inquiries, "CONSOLE_PAGE_SIZE", 2)
    add_inquiry(), add_inquiry()
    assert admin("GET", "/inquiries").json()["next_before"] is None


# Counts


def test_counts_list_every_status(admin):
    assert admin("GET", "/inquiries/counts").json() == {"new": 0, "in_progress": 0, "closed": 0}


def test_counts(admin, add_inquiry):
    add_inquiry(status="new"), add_inquiry(status="new"), add_inquiry(status="closed")
    assert admin("GET", "/inquiries/counts").json() == {"new": 2, "in_progress": 0, "closed": 1}


# One inquiry


def test_get_one(admin, add_inquiry):
    inquiry_id = add_inquiry(content="Details")
    r = admin("GET", f"/inquiries/{inquiry_id}")
    assert r.status_code == 200
    assert set(r.json()) == ITEM_KEYS
    assert r.json()["content"] == "Details"


def test_get_unknown_is_404(admin):
    r = admin("GET", "/inquiries/999")
    assert r.status_code == 404
    assert r.json() == {"detail": "inquiry not found"}


# Changes


def test_status_change_records_who(admin, add_inquiry):
    inquiry_id = add_inquiry()
    run_sql("update inquiries set updated_at = '2000-01-01' where id = %s", (inquiry_id,))
    r = admin("POST", f"/inquiries/{inquiry_id}", json={"status": "in_progress"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "in_progress"
    assert body["handled_by"] == ADMIN_EMAIL
    assert not body["updated_at"].startswith("2000")


def test_handler_is_the_one_who_changed_it(client, add_inquiry, admin_with_roles):
    inquiry_id = add_inquiry()
    headers = admin_with_roles("inquiries")
    client.post(f"/api/admin/inquiries/{inquiry_id}", json={"status": "closed"}, headers=headers)
    assert row_of(inquiry_id) == ("closed", "inquiries@test.com", None)


def test_same_status_keeps_the_handler(admin, add_inquiry):
    inquiry_id = add_inquiry(status="in_progress")
    run_sql("update inquiries set handled_by = 'other@test.com' where id = %s", (inquiry_id,))
    admin("POST", f"/inquiries/{inquiry_id}", json={"status": "in_progress"})
    assert row_of(inquiry_id) == ("in_progress", "other@test.com", None)


def test_back_to_new_clears_the_handler(admin, add_inquiry):
    inquiry_id = add_inquiry()
    admin("POST", f"/inquiries/{inquiry_id}", json={"status": "in_progress"})
    r = admin("POST", f"/inquiries/{inquiry_id}", json={"status": "new"})
    assert r.status_code == 200
    assert r.json()["handled_by"] is None
    assert row_of(inquiry_id) == ("new", None, None)


def test_note_alone_leaves_status_and_handler(admin, add_inquiry):
    inquiry_id = add_inquiry()
    r = admin("POST", f"/inquiries/{inquiry_id}", json={"internal_note": "  called the lecturer  "})
    assert r.status_code == 200
    assert row_of(inquiry_id) == ("new", None, "called the lecturer")


def test_status_alone_leaves_the_note(admin, add_inquiry):
    inquiry_id = add_inquiry()
    admin("POST", f"/inquiries/{inquiry_id}", json={"internal_note": "keep me"})
    admin("POST", f"/inquiries/{inquiry_id}", json={"status": "closed"})
    assert row_of(inquiry_id) == ("closed", ADMIN_EMAIL, "keep me")


@pytest.mark.parametrize("cleared", ["", "   ", None])
def test_note_can_be_cleared(admin, add_inquiry, cleared):
    inquiry_id = add_inquiry()
    admin("POST", f"/inquiries/{inquiry_id}", json={"internal_note": "temporary"})
    admin("POST", f"/inquiries/{inquiry_id}", json={"internal_note": cleared})
    assert row_of(inquiry_id)[2] is None


def test_note_at_the_limit_is_accepted(admin, add_inquiry):
    inquiry_id = add_inquiry()
    assert admin("POST", f"/inquiries/{inquiry_id}", json={"internal_note": "a" * 2000}).status_code == 200


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({}, "nothing to update"),
        ({"status": None}, "invalid status"),
        ({"status": "open"}, "invalid status"),
        ({"internal_note": "a" * 2001}, "invalid internal_note"),
    ],
)
def test_invalid_changes(admin, add_inquiry, body, detail):
    inquiry_id = add_inquiry()
    r = admin("POST", f"/inquiries/{inquiry_id}", json=body)
    assert r.status_code == 422
    assert r.json() == {"detail": detail}
    assert row_of(inquiry_id) == ("new", None, None)


def test_change_unknown_is_404(admin):
    r = admin("POST", "/inquiries/999", json={"status": "closed"})
    assert r.status_code == 404
    assert r.json() == {"detail": "inquiry not found"}
    