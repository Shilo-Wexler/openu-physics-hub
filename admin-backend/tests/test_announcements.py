"""Announcements: the public list, pinned one and image (no sign-in), and the console routes (announcements role)."""

from io import BytesIO

import pytest
from PIL import Image

from app.images import MAX_SIDE
from app.routes.announcements import PUBLIC_PAGE_SIZE
from conftest import ADMIN_EMAIL, access, run_sql


def image_bytes(width: int = 3000, height: int = 2000, fmt: str = "JPEG") -> bytes:
    out = BytesIO()
    Image.new("RGB", (width, height), "red").save(out, fmt)
    return out.getvalue()


@pytest.fixture
def draft(admin):
    """draft(title="...") creates an announcement through the console (a draft) and returns it."""

    def _draft(**overrides) -> dict:
        payload = {"title": "Notice", "body": "Notice text"}
        payload.update(overrides)
        response = admin("POST", "/announcements", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _draft


@pytest.fixture
def act(admin):
    """act(id, "publish", pin=True) runs one console action on an announcement and returns the response."""

    def _act(announcement_id: int, action: str, **params):
        return admin("POST", f"/announcements/{announcement_id}/{action}", params=params)

    return _act


@pytest.fixture
def published(draft, act):
    """published(pin=True, title="...") creates and publishes an announcement and returns it."""

    def _published(pin: bool = False, **overrides) -> dict:
        response = act(draft(**overrides)["id"], "publish", pin=pin)
        assert response.status_code == 200, response.text
        return response.json()

    return _published


@pytest.fixture
def upload(admin):
    """upload(id, alt="...") sends an image the way the console does: the file itself as the body."""

    def _upload(announcement_id: int, data: bytes | None = None, alt: str | None = "A red square"):
        params = {} if alt is None else {"alt": alt}
        return admin(
            "POST",
            f"/announcements/{announcement_id}/image",
            params=params,
            content=image_bytes() if data is None else data,
        )

    return _upload


@pytest.fixture
def image_only(draft, upload, act):
    """image_only(publish=True) creates an announcement with no title and no text, only an image."""

    def _image_only(publish: bool = False) -> dict:
        created = draft(title="", body="")
        assert upload(created["id"]).status_code == 200
        if publish:
            response = act(created["id"], "publish")
            assert response.status_code == 200, response.text
            return response.json()
        return created

    return _image_only


def public_ids(client) -> list[int]:
    return [item["id"] for item in client.get("/api/announcements").json()["announcements"]]


EMPTY = {"detail": "announcement is empty"}


# ---------- Console: create, edit, delete ----------

def test_create_is_a_draft(draft, client):
    created = draft(title="  Title  ", body="Line 1\nLine 2")
    assert created["title"] == "Title"  # trimmed
    assert created["body"] == "Line 1\nLine 2"
    assert created["published_at"] is None
    assert created["pinned"] is False
    assert created["author_email"] == ADMIN_EMAIL
    assert created["edited_at"] is None
    assert created["image"] is None
    assert public_ids(client) == []


def test_create_with_title_only(draft):
    assert draft(body="")["body"] == ""


def test_create_with_text_only(draft):
    created = draft(title="   ")
    assert created["title"] == ""  # spaces alone are no title
    assert created["body"] == "Notice text"


def test_an_empty_draft_is_allowed(admin):
    """The console saves the text before the image, so an image-only announcement starts out empty."""
    response = admin("POST", "/announcements", json={})
    assert response.status_code == 201
    assert (response.json()["title"], response.json()["body"]) == ("", "")


@pytest.mark.parametrize(
    "payload, detail",
    [
        ({"title": "x" * 201}, "invalid title"),
        ({"title": "x", "body": "x" * 5001}, "invalid body"),
    ],
)
def test_create_rejects_invalid(admin, payload, detail):
    response = admin("POST", "/announcements", json=payload)
    assert response.status_code == 422
    assert response.json() == {"detail": detail}


def test_editing_a_draft_is_not_an_edit(admin, draft):
    created = draft()
    response = admin("POST", f"/announcements/{created['id']}", json={"title": "New", "body": "Also new"})
    assert response.status_code == 200
    assert response.json()["title"] == "New"
    assert response.json()["edited_at"] is None


def test_editing_a_published_one_marks_it_edited(admin, published):
    created = published()
    same = admin("POST", f"/announcements/{created['id']}", json={"title": created["title"], "body": created["body"]})
    assert same.json()["edited_at"] is None
    changed = admin("POST", f"/announcements/{created['id']}", json={"title": "New", "body": created["body"]})
    assert changed.json()["edited_at"] is not None


def test_edit_missing_announcement(admin):
    response = admin("POST", "/announcements/999", json={"title": "x"})
    assert response.status_code == 404
    assert response.json() == {"detail": "announcement not found"}


def test_edit_missing_announcement_with_no_content(admin):
    """Missing comes first: an empty edit of an announcement that is not there is still 404."""
    response = admin("POST", "/announcements/999", json={})
    assert response.status_code == 404


def test_delete(admin, published, client):
    created = published(pin=True)
    assert admin("DELETE", f"/announcements/{created['id']}").status_code == 204
    assert public_ids(client) == []
    assert client.get("/api/announcements/pinned").json() is None
    assert admin("DELETE", f"/announcements/{created['id']}").status_code == 404


def test_console_list_order_and_total(admin, draft, published):
    old = published()
    pinned = published(pin=True)
    new = published()
    unpublished = draft()
    body = admin("GET", "/announcements", params={"page_size": 3}).json()
    assert body["total"] == 4
    # Pinned, then drafts, then published newest first.
    assert [item["id"] for item in body["items"]] == [pinned["id"], unpublished["id"], new["id"]]
    second_page = admin("GET", "/announcements", params={"page_size": 3, "page": 2}).json()
    assert [item["id"] for item in second_page["items"]] == [old["id"]]


# ---------- Console: a published announcement always shows something ----------

def test_an_empty_draft_cannot_be_published(act, draft, client):
    created = draft(title="", body="")
    response = act(created["id"], "publish", pin=True)
    assert response.status_code == 422
    assert response.json() == EMPTY
    assert public_ids(client) == []
    assert client.get("/api/announcements/pinned").json() is None


@pytest.mark.parametrize("fields", [{"body": ""}, {"title": ""}])
def test_title_or_text_alone_can_be_published(published, fields):
    assert published(**fields)["published_at"] is not None


def test_an_image_alone_can_be_published(image_only, client):
    created = image_only(publish=True)
    item = client.get("/api/announcements").json()["announcements"][0]
    assert item["id"] == created["id"]
    assert (item["title"], item["body"]) == ("", "")
    assert item["image"] is not None


def test_a_published_one_cannot_be_emptied(admin, published):
    created = published()
    response = admin("POST", f"/announcements/{created['id']}", json={"title": " ", "body": ""})
    assert response.status_code == 422
    assert response.json() == EMPTY
    assert run_sql("select title, body from announcements") == [(created["title"], created["body"])]


def test_a_published_image_one_can_lose_its_text(admin, upload, published):
    """With an image left, the title and the text can both go."""
    created = published()
    upload(created["id"])
    response = admin("POST", f"/announcements/{created['id']}", json={"title": "", "body": ""})
    assert response.status_code == 200
    assert (response.json()["title"], response.json()["body"]) == ("", "")


def test_a_draft_can_be_emptied(admin, draft):
    created = draft()
    assert admin("POST", f"/announcements/{created['id']}", json={}).status_code == 200


def test_the_only_image_of_a_published_one_stays(admin, image_only):
    created = image_only(publish=True)
    response = admin("DELETE", f"/announcements/{created['id']}/image")
    assert response.status_code == 422
    assert response.json() == EMPTY
    assert run_sql("select image is not null, image_version from announcements") == [(True, 1)]


def test_the_only_image_of_a_draft_can_go(admin, image_only):
    created = image_only()
    response = admin("DELETE", f"/announcements/{created['id']}/image")
    assert response.status_code == 200
    assert response.json()["image"] is None


def test_the_database_refuses_an_empty_published_one():
    with pytest.raises(Exception, match="announcements_has_content"):
        run_sql("insert into announcements (author_email, published_at) values ('x@t.com', now())")


# ---------- Console: publish and pin ----------

def test_publish(act, draft, client):
    created = draft()
    response = act(created["id"], "publish")
    assert response.status_code == 200
    assert response.json()["published_at"] is not None
    assert response.json()["pinned"] is False
    assert public_ids(client) == [created["id"]]
    assert client.get("/api/announcements/pinned").json() is None


def test_publish_and_pin(act, draft, client):
    created = draft()
    assert act(created["id"], "publish", pin=True).json()["pinned"] is True
    assert client.get("/api/announcements/pinned").json()["id"] == created["id"]


def test_only_one_is_pinned(act, published, client):
    first = published(pin=True)
    second = published(pin=True)
    assert client.get("/api/announcements/pinned").json()["id"] == second["id"]
    assert run_sql("select id from announcements where pinned") == [(second["id"],)]
    # Pinning the first again moves the pin back.
    assert act(first["id"], "pin").json()["pinned"] is True
    assert run_sql("select id from announcements where pinned") == [(first["id"],)]


def test_the_database_allows_one_pinned():
    run_sql("insert into announcements (title, author_email, published_at, pinned) values ('a', 'x@t.com', now(), true)")
    with pytest.raises(Exception, match="announcements_one_pinned_idx"):
        run_sql("insert into announcements (title, author_email, published_at, pinned) values ('b', 'x@t.com', now(), true)")


def test_a_draft_cannot_be_pinned(act, draft):
    response = act(draft()["id"], "pin")
    assert response.status_code == 409
    assert response.json() == {"detail": "announcement is not published"}


def test_unpin_keeps_it_published(act, published, client):
    created = published(pin=True)
    response = act(created["id"], "unpin")
    assert response.json()["pinned"] is False
    assert client.get("/api/announcements/pinned").json() is None
    assert public_ids(client) == [created["id"]]


def test_unpublish_takes_it_off_the_site(act, published, client):
    created = published(pin=True)
    response = act(created["id"], "unpublish")
    assert response.json()["published_at"] is None
    assert response.json()["pinned"] is False
    assert public_ids(client) == []
    assert client.get("/api/announcements/pinned").json() is None


def test_publishing_again_puts_it_on_top(act, published, client):
    first = published()
    second = published()
    act(first["id"], "unpublish")
    act(first["id"], "publish")
    assert public_ids(client) == [first["id"], second["id"]]


@pytest.mark.parametrize("action", ["publish", "unpublish", "pin", "unpin"])
def test_actions_on_a_missing_announcement(act, action):
    response = act(999, action)
    assert response.status_code == 404
    assert response.json() == {"detail": "announcement not found"}


# ---------- Console: images ----------

def test_upload_image(upload, draft, admin):
    created = draft()
    response = upload(created["id"], image_bytes(3000, 2000))
    assert response.status_code == 200, response.text
    image = response.json()["image"]
    assert (image["width"], image["height"]) == (MAX_SIDE, 1067)
    assert image["alt"] == "A red square"
    # The console's own URL: it also shows drafts, and needs the sign-in token.
    assert image["url"] == f"/api/admin/announcements/{created['id']}/image?v=1"
    assert response.json()["edited_at"] is None  # still a draft

    served = admin("GET", f"/announcements/{created['id']}/image")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"
    assert served.headers["cache-control"].startswith("private")
    assert Image.open(BytesIO(served.content)).format == "WEBP"


def test_a_draft_image_is_not_public(upload, draft, client):
    created = draft()
    upload(created["id"])
    assert client.get(f"/api/announcements/{created['id']}/image").status_code == 404
    assert client.get(f"/api/admin/announcements/{created['id']}/image").status_code == 401


def test_a_published_image_is_public(upload, draft, act, client):
    created = draft()
    upload(created["id"])
    act(created["id"], "publish")
    image = client.get("/api/announcements").json()["announcements"][0]["image"]
    assert image["url"] == f"/api/announcements/{created['id']}/image?v=1"
    served = client.get(image["url"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"
    assert "immutable" in served.headers["cache-control"]
    assert served.headers["cache-control"].startswith("public")
    assert served.headers["x-content-type-options"] == "nosniff"


def test_changing_the_image_of_a_published_one_marks_it_edited(upload, published):
    assert upload(published()["id"]).json()["edited_at"] is not None


def test_replacing_the_image_changes_its_url(upload, draft):
    created = draft()
    upload(created["id"], image_bytes(800, 600, "PNG"))
    assert upload(created["id"]).json()["image"]["url"].endswith("?v=2")


def test_upload_needs_alt(upload, draft):
    response = upload(draft()["id"], alt=None)
    assert response.status_code == 422
    assert response.json() == {"detail": "missing alt"}


def test_upload_rejects_non_images(upload, draft):
    response = upload(draft()["id"], b"\x3csvg xmlns='http://www.w3.org/2000/svg'/>")
    assert response.status_code == 422
    assert response.json() == {"detail": "not an image"}


def test_upload_to_missing_announcement(upload):
    assert upload(999).status_code == 404


def test_delete_image(admin, upload, draft):
    created = draft()
    upload(created["id"])
    response = admin("DELETE", f"/announcements/{created['id']}/image")
    assert response.status_code == 200
    assert response.json()["image"] is None
    assert admin("GET", f"/announcements/{created['id']}/image").status_code == 404
    # Removing it again is not an error and changes nothing.
    assert admin("DELETE", f"/announcements/{created['id']}/image").status_code == 200
    assert run_sql("select image_version from announcements")[0][0] == 2


def test_delete_image_of_missing_announcement(admin):
    response = admin("DELETE", "/announcements/999/image")
    assert response.status_code == 404
    assert response.json() == {"detail": "announcement not found"}


# ---------- Public site ----------

def test_public_list_hides_the_author_and_drafts(client, published, draft):
    published()
    draft()
    items = client.get("/api/announcements").json()["announcements"]
    assert len(items) == 1
    assert "author_email" not in items[0]
    assert "created_at" not in items[0]


def test_public_paging(client, published):
    """The pinned one on top of the first page, then PUBLIC_PAGE_SIZE others per page, newest first."""
    total = PUBLIC_PAGE_SIZE * 2 + 3
    ids = [published(title=f"Notice {n}")["id"] for n in range(total)]
    pinned_id = ids[5]
    run_sql("update announcements set pinned = true where id = %s", (pinned_id,))

    first = client.get("/api/announcements").json()
    first_ids = [item["id"] for item in first["announcements"]]
    assert first_ids[0] == pinned_id
    assert len(first_ids) == 1 + PUBLIC_PAGE_SIZE
    assert first_ids[1:] == [i for i in reversed(ids) if i != pinned_id][:PUBLIC_PAGE_SIZE]

    seen = list(first_ids)
    before = first["next_before"]
    pages = 1
    while before is not None:
        page = client.get("/api/announcements", params={"before": before}).json()
        assert all(not item["pinned"] for item in page["announcements"])
        seen.extend(item["id"] for item in page["announcements"])
        before = page["next_before"]
        pages += 1
    assert pages == 3
    assert sorted(seen) == sorted(ids)  # every one exactly once


def test_public_paging_rejects_a_bad_cursor(client):
    response = client.get("/api/announcements", params={"before": "nonsense"})
    assert response.status_code == 422
    assert response.json() == {"detail": "invalid before"}


def test_public_image_of_announcement_without_one(client, published):
    response = client.get(f"/api/announcements/{published()['id']}/image")
    assert response.status_code == 404
    assert response.json() == {"detail": "image not found"}


# ---------- Roles ----------

def test_console_needs_the_announcements_role(client):
    run_sql(
        "insert into admins (email, roles) values ('mod@test.com', '{moderator}'), ('ann@test.com', '{announcements}')"
    )
    url = "/api/admin/announcements"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=access("stranger@test.com")).status_code == 403
    assert client.get(url, headers=access("mod@test.com")).json() == {"detail": "requires the announcements role"}

    response = client.post(url, json={"title": "x"}, headers=access("ann@test.com"))
    assert response.status_code == 201
    assert response.json()["author_email"] == "ann@test.com"
    