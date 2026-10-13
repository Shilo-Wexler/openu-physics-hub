"""End-to-end smoke test against a RUNNING admin backend, over HTTP only (no DB access).

Usage:  python scripts/smoke_test.py [base_url]      default base_url: http://localhost:8000

After every request it checks the resulting state, not just the status code:
- a change that should happen did happen, with the right values (read back through the API);
- a rejected request changed nothing (full snapshot before == after);
- summary, unread/read lists and all stats agree with the actual list of requests.

WARNING: it starts and ends by deleting ALL requests and unblocking ALL emails through the API.
It only runs against a dev server: it needs the DEV_AUTH_EMAIL bypass, and stops if "dev" is not an admin.
Standard library only, so it runs in a bare python image without pip install.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
ADMIN = "dev"
STUDENT = "smoke-student@test.com"
OTHER = "smoke-other@test.com"
COURSE = "מכניקה"
MISSING = 999999999

passed, failed = 0, []


# ---------- HTTP ----------

def call(method, path, token=None, body=None, params=None):
    """Returns (status, parsed JSON or None). Never raises on HTTP errors."""
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    return status, (json.loads(raw.decode("utf-8")) if raw else None)


def admin(method, path, **kwargs):
    return call(method, "/api/admin" + path, token=ADMIN, **kwargs)


def submit(email=STUDENT, **overrides):
    body = {"id_token": f"dev:{email}", "email": email, "full_name": "ישראל ישראלי",
            "course_name": COURSE, "body": "פנייה לבדיקה"}
    body.update(overrides)
    return call("POST", "/api/requests", body=body)


def blocked_path(email):
    return "/blocked/" + urllib.parse.quote(email)


# ---------- Reporting ----------

def check(name, ok, detail=None):
    global passed
    if ok:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed.append(name)
        print(f"  FAIL  {name}" + (f"  -> {detail}" if detail is not None else ""))
    return ok


def expect(name, result, status):
    """Checks the status of a (status, body) result and returns the body."""
    got, body = result
    check(f"{name} -> {status}", got == status, f"got {got}: {body}")
    return body


def section(title):
    print(f"\n== {title}")


# ---------- State ----------

def snapshot():
    """All requests (oldest first) and all blocked emails, as the API reports them."""
    items, page = [], 1
    while True:
        status, body = admin("GET", "/requests", params={"page_size": 100, "page": page, "sort": "oldest"})
        if status != 200:
            raise RuntimeError(f"cannot list requests: {status} {body}")
        items += body["items"]
        if len(items) >= body["total"] or not body["items"]:
            break
        page += 1
    status, blocked = admin("GET", "/blocked")
    if status != 200:
        raise RuntimeError(f"cannot list blocked emails: {status} {blocked}")
    return {"requests": items, "blocked": blocked}


def _key(snap):
    reqs = [(r["id"], r["email"], r["course_name"], r["status"], r["is_opened"], r["preview"]) for r in snap["requests"]]
    blocked = sorted((b["email"], b["reason"]) for b in snap["blocked"])
    return reqs, blocked


def unchanged(name, before):
    """For rejected requests: nothing at all may have changed."""
    after = snapshot()
    check(f"{name}: state unchanged", _key(after) == _key(before), {"before": _key(before), "after": _key(after)})


def one_new(name, before):
    """For accepted submissions: exactly one new request. Returns it, or {}."""
    after = snapshot()
    old_ids = {r["id"] for r in before["requests"]}
    new = [r for r in after["requests"] if r["id"] not in old_ids]
    same_old = [r for r in after["requests"] if r["id"] in old_ids]
    check(f"{name}: exactly one new request, others untouched",
          len(new) == 1 and _key({"requests": same_old, "blocked": []}) == _key({"requests": before["requests"], "blocked": []}),
          {"new": new})
    return new[0] if len(new) == 1 else {}


def get_request(rid):
    status, body = admin("GET", f"/requests/{rid}")
    return body if status == 200 else {}


def consistent(label):
    """Summary, unread/read lists and every stat must agree with the actual list of requests."""
    snap = snapshot()
    reqs = snap["requests"]
    blocked = {b["email"] for b in snap["blocked"]}
    problems = []

    expected_summary = {
        "unread": sum(not r["is_opened"] for r in reqs),
        "in_progress": sum(r["is_opened"] and r["status"] == "new" for r in reqs),
        "closed": sum(r["status"] == "closed" for r in reqs),
        "total": len(reqs),
    }
    summary = admin("GET", "/summary")[1]
    if summary != expected_summary:
        problems.append(f"summary {summary} != {expected_summary}")

    unread_ids = [r["id"] for r in admin("GET", "/requests/unread", params={"limit": 100})[1] or []]
    if unread_ids != [r["id"] for r in reqs if not r["is_opened"]]:
        problems.append(f"unread list {unread_ids}")
    read_ids = [r["id"] for r in admin("GET", "/requests/read", params={"limit": 100})[1] or []]
    if read_ids != [r["id"] for r in reversed(reqs) if r["is_opened"]]:
        problems.append(f"read list {read_ids}")

    by_course = {r["course_name"]: r for r in admin("GET", "/stats/by-course")[1] or []}
    totals = Counter(r["course_name"] for r in reqs)
    unread = Counter(r["course_name"] for r in reqs if not r["is_opened"])
    for course, row in by_course.items():
        if (row["total"], row["unread"]) != (totals[course], unread[course]):
            problems.append(f"by-course {course}: {row['total']}/{row['unread']} != {totals[course]}/{unread[course]}")
    missing = set(totals) - set(by_course)
    if missing:
        problems.append(f"by-course is missing {missing}")

    weekly = admin("GET", "/stats/weekly", params={"weeks": 4})[1] or []
    if sum(w["total"] for w in weekly) != len(reqs):  # every request in this run is from this week
        problems.append(f"weekly sum {sum(w['total'] for w in weekly)} != {len(reqs)}")

    top = admin("GET", "/stats/top-senders", params={"limit": 100})[1] or []
    per_email = Counter(r["email"] for r in reqs)
    if {t["email"]: t["total"] for t in top} != dict(per_email):
        problems.append(f"top-senders {top} != {dict(per_email)}")
    wrong_block_flag = [t["email"] for t in top if t["is_blocked"] != (t["email"] in blocked)]
    if wrong_block_flag:
        problems.append(f"top-senders is_blocked wrong for {wrong_block_flag}")

    check(f"[{label}] summary, lists and stats agree with the data", not problems, problems)


def clean():
    """Deletes every request and unblocks every email, through the API."""
    for _ in range(1000):  # bounded, in case deletes keep failing
        status, page = admin("GET", "/requests", params={"page_size": 100})
        if status != 200 or not page["items"]:
            break
        for item in page["items"]:
            admin("DELETE", f"/requests/{item['id']}")
    for b in admin("GET", "/blocked")[1] or []:
        admin("DELETE", blocked_path(b["email"]))


# ---------- The run ----------

def main():
    print(f"Smoke test against {BASE}")

    section("Server and access")
    try:
        expect("GET /health", call("GET", "/health"), 200)
    except urllib.error.URLError as e:
        print(f"  Cannot reach {BASE}: {e.reason}. Is admin-api running?")
        return 2
    if call("GET", "/api/admin/summary", token=ADMIN)[0] != 200:
        print("  'dev' is not accepted as admin. Run the server with DEV_AUTH_EMAIL set to an email in admins.")
        return 2
    expect("admin without token", call("GET", "/api/admin/summary"), 401)
    expect("admin with invalid token", call("GET", "/api/admin/summary", token="not-a-token"), 401)
    expect("admin as a non-admin", call("GET", "/api/admin/summary", token=f"dev:{STUDENT}"), 403)
    me = expect("GET /api/admin/me", admin("GET", "/me"), 200) or {}
    check("me returns the admin's email", "@" in (me.get("email") or ""), me)
    expect("me as a non-admin", call("GET", "/api/admin/me", token=f"dev:{STUDENT}"), 403)

    section("Clean start")
    clean()
    snap = snapshot()
    check("no requests and no blocked emails", snap["requests"] == [] and snap["blocked"] == [], _key(snap))
    consistent("clean start")

    section("Courses")
    courses = expect("GET courses", admin("GET", "/courses"), 200) or []
    names = [c["name"] for c in courses]
    check("'כללי' is first, as course 0", courses[:1] == [{"name": "כללי", "course_number": 0}], courses[:1])
    check(f"'{COURSE}' exists", COURSE in names)
    check("course names are unique", len(names) == len(set(names)))

    section("Student submission: accepted  [STUDENT-SIDE]")
    before = snapshot()
    check("valid request returns ok", expect("valid request", submit(), 201) == {"ok": True})
    first = one_new("valid request", before)
    rid = first.get("id", 0)
    check("stored as new, unread, right email/course/text",
          (first.get("email"), first.get("course_name"), first.get("status"), first.get("is_opened"), first.get("preview"))
          == (STUDENT, COURSE, "new", False, "פנייה לבדיקה"), first)
    full = get_request(rid)
    check("full request: Hebrew name and body intact",
          (full.get("full_name"), full.get("body")) == ("ישראל ישראלי", "פנייה לבדיקה"), full)
    consistent("after valid request")

    before = snapshot()
    expect("general course", submit(course_name="כללי", body="פנייה כללית"), 201)
    check("stored under 'כללי'", one_new("general course", before).get("course_name") == "כללי")
    consistent("after general request")

    before = snapshot()
    upper = "Smoke-Upper@Test.com"
    expect("mixed-case email", submit(email=upper, id_token=f"dev:{upper}", body="מייל באותיות גדולות"), 201)
    check("email stored lowercase", one_new("mixed-case email", before).get("email") == upper.lower())
    consistent("after mixed-case request")

    section("Student submission: rejected, nothing may change  [STUDENT-SIDE]")
    rejected = [
        ("same text again (duplicate)", {}, 409),
        ("unknown course", {"course_name": "קורס שלא קיים", "body": "x"}, 422),
        ("email does not match token", {"id_token": f"dev:{OTHER}", "body": "y"}, 401),
        ("invalid token", {"id_token": "not-a-token", "body": "z"}, 401),
        ("body over 5000", {"body": "א" * 5001}, 422),
        ("empty body", {"body": "   "}, 422),
        ("name over 100", {"full_name": "a" * 101, "body": "w"}, 422),
    ]
    for name, overrides, status in rejected:
        before = snapshot()
        expect(name, submit(**overrides), status)
        unchanged(name, before)

    section("Read / unread / close")
    before = snapshot()
    expect("close before read", admin("POST", f"/requests/{rid}/close"), 409)
    unchanged("close before read", before)

    body = expect("read", admin("POST", f"/requests/{rid}/read"), 200) or {}
    check("read: response says opened, still new", (body.get("is_opened"), body.get("status")) == (True, "new"), body)
    full = get_request(rid)
    check("read: stored as opened, still new", (full.get("is_opened"), full.get("status")) == (True, "new"), full)
    consistent("after read")

    before = snapshot()
    expect("read again", admin("POST", f"/requests/{rid}/read"), 200)
    unchanged("read again (idempotent)", before)

    expect("unread", admin("POST", f"/requests/{rid}/unread"), 200)
    check("unread: stored as not opened", get_request(rid).get("is_opened") is False)
    consistent("after unread")

    expect("read before closing", admin("POST", f"/requests/{rid}/read"), 200)
    body = expect("close", admin("POST", f"/requests/{rid}/close"), 200) or {}
    check("close: response says closed", body.get("status") == "closed", body)
    full = get_request(rid)
    check("close: stored as closed and opened", (full.get("status"), full.get("is_opened")) == ("closed", True), full)
    consistent("after close")

    before = snapshot()
    expect("close again", admin("POST", f"/requests/{rid}/close"), 200)
    unchanged("close again (idempotent)", before)

    before = snapshot()
    expect("unread after close", admin("POST", f"/requests/{rid}/unread"), 409)
    unchanged("unread after close", before)

    body = expect("reopen (back to handling)", admin("POST", f"/requests/{rid}/reopen"), 200) or {}
    full = get_request(rid)
    check("reopen: stored as new and still read (in progress)",
          (body.get("status"), full.get("status"), full.get("is_opened")) == ("new", "new", True), (body, full))
    consistent("after reopen")
    expect("close again after reopen", admin("POST", f"/requests/{rid}/close"), 200)

    for action in ("read", "unread", "close", "reopen"):
        before = snapshot()
        expect(f"{action} on a missing request", admin("POST", f"/requests/{MISSING}/{action}"), 404)
        unchanged(f"{action} on a missing request", before)
    expect("get a missing request", admin("GET", f"/requests/{MISSING}"), 404)

    section("Filters and paging (compared with the data)")
    reqs = snapshot()["requests"]
    page = admin("GET", "/requests", params={"course_name": COURSE})[1] or {}
    check(f"filter course={COURSE}", page.get("total") == sum(r["course_name"] == COURSE for r in reqs), page.get("total"))
    page = admin("GET", "/requests", params={"status": "closed"})[1] or {}
    check("filter status=closed", [r["id"] for r in page.get("items", [])] == [r["id"] for r in reqs if r["status"] == "closed"])
    page = admin("GET", "/requests", params={"is_opened": "false"})[1] or {}
    check("filter is_opened=false", page.get("total") == sum(not r["is_opened"] for r in reqs), page.get("total"))
    page = admin("GET", "/requests", params={"email": upper})[1] or {}
    check("filter by email ignores case", page.get("total") == 1, page.get("total"))
    page = admin("GET", "/requests", params={"page_size": 1, "page": 2})[1] or {}
    newest_first = [r["id"] for r in reversed(reqs)]
    check("paging: page 2 of size 1 is the 2nd newest",
          page.get("total") == len(reqs) and [r["id"] for r in page.get("items", [])] == newest_first[1:2], page)
    expect("page_size over the limit", admin("GET", "/requests", params={"page_size": 1000}), 422)
    future = {r["course_name"]: r["total"] for r in admin("GET", "/stats/by-course", params={"date_from": "2100-01-01T00:00:00"})[1] or []}
    check("by-course with a future date range is all zero", future and not any(future.values()), future)

    section("Blocking")
    body = expect("block", admin("POST", "/blocked", body={"email": f" {OTHER.upper()} ", "reason": "smoke test"}), 201) or {}
    check("block: email normalized in the response", body.get("email") == OTHER, body)
    check("block: listed with its reason", [(b["email"], b["reason"]) for b in snapshot()["blocked"]] == [(OTHER, "smoke test")])
    consistent("after block")

    before = snapshot()
    expect("block again with a new reason", admin("POST", "/blocked", body={"email": OTHER, "reason": "updated"}), 201)
    check("block again: one entry, reason updated",
          [(b["email"], b["reason"]) for b in snapshot()["blocked"]] == [(OTHER, "updated")])

    before = snapshot()
    status, body = submit(email=OTHER, body="מנסה לשלוח כשחסום")
    check("blocked sender -> 403 with a generic message",
          status == 403 and body == {"detail": "request not accepted"}, (status, body))
    unchanged("blocked sender", before)

    expect("block a sender who has requests", admin("POST", "/blocked", body={"email": STUDENT}), 201)
    consistent("after blocking a sender with requests")  # top-senders must show is_blocked
    expect("unblock that sender", admin("DELETE", blocked_path(STUDENT)), 204)

    expect("unblock", admin("DELETE", blocked_path(OTHER)), 204)
    check("unblock: no longer listed", snapshot()["blocked"] == [])
    consistent("after unblock")

    before = snapshot()
    expect("unblock again", admin("DELETE", blocked_path(OTHER)), 404)
    unchanged("unblock again", before)

    before = snapshot()
    expect("submit after unblock", submit(email=OTHER, body="אחרי ביטול חסימה"), 201)
    check("submit after unblock: stored", one_new("submit after unblock", before).get("email") == OTHER)
    consistent("after submit from the unblocked sender")

    section("Rate limit (5 per hour)  [STUDENT-SIDE]")
    for i in range(4):  # OTHER already sent 1
        expect(f"request {i + 2} of 5", submit(email=OTHER, body=f"פנייה {i}"), 201)
    check("5 requests stored for the sender", sum(r["email"] == OTHER for r in snapshot()["requests"]) == 5)
    before = snapshot()
    expect("6th request in an hour", submit(email=OTHER, body="שישית"), 429)
    unchanged("6th request in an hour", before)
    consistent("after rate limit")

    section("Delete")
    before = snapshot()
    expect("delete", admin("DELETE", f"/requests/{rid}"), 204)
    after = snapshot()
    check("delete: removed, others untouched",
          _key(after)[0] == [k for k in _key(before)[0] if k[0] != rid] and len(after["requests"]) == len(before["requests"]) - 1)
    expect("get the deleted request", admin("GET", f"/requests/{rid}"), 404)
    consistent("after delete")

    before = snapshot()
    expect("delete again", admin("DELETE", f"/requests/{rid}"), 404)
    unchanged("delete again", before)

    section("Admins: two levels (full = manage admins too; standard = everything else)")
    standard = ["announcements", "inquiries", "moderator"]
    smoke_admin = "smoke-admin@test.com"
    q = urllib.parse.quote
    if "admin" not in (me.get("roles") or []):
        print("  SKIP  the signed-in admin is not a full admin, so admin management cannot be tested")
    else:
        admin("DELETE", "/admins/" + q(smoke_admin))  # leftover from an aborted run
        before_admins = admin("GET", "/admins")[1] or []
        check("the signed-in admin is listed as full admin",
              any(a["email"] == me.get("email") and "admin" in a["roles"] for a in before_admins), before_admins)
        expect("not an admin yet", call("GET", "/api/admin/me", token=f"dev:{smoke_admin}"), 403)

        body = expect("add an admin (default level)", admin("POST", "/admins", body={"email": f"  {smoke_admin.upper()} "}), 201) or {}
        check("stored lowercase, standard level, with who added",
              (body.get("email"), body.get("roles"), body.get("added_by")) == (smoke_admin, standard, me.get("email")), body)
        after = admin("GET", "/admins")[1] or []
        check("exactly one admin was added", sorted(a["email"] for a in after) == sorted([a["email"] for a in before_admins] + [smoke_admin]), after)

        token = f"dev:{smoke_admin}"
        check("the new admin's /me shows the standard level", (call("GET", "/api/admin/me", token=token)[1] or {}).get("roles") == standard)
        for path in ("/summary", "/requests", "/stats/by-course", "/blocked", "/admins"):
            expect(f"standard admin can GET {path}", call("GET", "/api/admin" + path, token=token), 200)
        before = admin("GET", "/admins")[1]
        expect("standard admin cannot add admins", call("POST", "/api/admin/admins", token=token, body={"email": "x@test.com"}), 403)
        expect("standard admin cannot remove admins", call("DELETE", "/api/admin/admins/" + q(me.get("email") or ""), token=token), 403)
        expect("standard admin cannot change levels", call("PUT", "/api/admin/admins/" + q(me.get("email") or "") + "/roles", token=token, body={"roles": standard}), 403)
        check("their attempts changed nothing", admin("GET", "/admins")[1] == before)

        body = expect("promote to full admin", admin("PUT", f"/admins/{q(smoke_admin)}/roles", body={"roles": ["admin"]}), 200) or {}
        check("promoted: roles are now [admin]", body.get("roles") == ["admin"], body)
        expect("now they can add an admin", call("POST", "/api/admin/admins", token=token, body={"email": "smoke-third@test.com"}), 201)
        expect("and remove one", call("DELETE", "/api/admin/admins/smoke-third%40test.com", token=token), 204)
        body = expect("demote back to standard", admin("PUT", f"/admins/{q(smoke_admin)}/roles", body={"roles": standard}), 200) or {}
        check("demoted: standard roles again", body.get("roles") == standard, body)

        before = admin("GET", "/admins")[1]
        expect("adding the same admin again", admin("POST", "/admins", body={"email": smoke_admin}), 409)
        body = expect("an invalid email", admin("POST", "/admins", body={"email": "not-an-email"}), 422)
        check("validation errors are one short detail", body == {"detail": "invalid email"}, body)
        expect("an unknown role", admin("POST", "/admins", body={"email": "y@test.com", "roles": ["owner"]}), 422)
        expect("changing your own level", admin("PUT", "/admins/" + q(me.get("email") or "") + "/roles", body={"roles": standard}), 409)
        expect("removing yourself", admin("DELETE", "/admins/" + q(me.get("email") or "")), 409)
        check("none of these changed anything", admin("GET", "/admins")[1] == before)

        expect("remove the added admin", admin("DELETE", "/admins/" + q(smoke_admin)), 204)
        check("back to the original admins", sorted(a["email"] for a in admin("GET", "/admins")[1] or []) == sorted(a["email"] for a in before_admins))
        expect("the removed admin lost access at once", call("GET", "/api/admin/me", token=token), 403)
        expect("remove again", admin("DELETE", "/admins/" + q(smoke_admin)), 404)

    section("Chat moderation (needs chat-backend, CHAT_API_URL and MOD_API_TOKEN)")
    status, reported = admin("GET", "/chat/reported-messages")
    if status == 503:
        print("  SKIP  chat moderation is not configured on this server")
    elif check("GET chat/reported-messages -> 200", status == 200, (status, reported)):
        expect("GET chat/blocked-users", admin("GET", "/chat/blocked-users"), 200)
        expect("GET chat/actions", admin("GET", "/chat/actions"), 200)
        expect("block a malformed user id", admin("POST", "/chat/users/not-a-uuid/block"), 422)
        target = next((m for m in reported or [] if not m["author_blocked"]), None)
        if target is None:
            print("  SKIP  block/unblock: no reported message by an unblocked author (run the dev chat seed)")
        else:
            author = target["author_id"]
            expect("block the author", admin("POST", f"/chat/users/{author}/block"), 200)
            blocked = [u["user_id"] for u in admin("GET", "/chat/blocked-users")[1] or []]
            check("author is in the chat's blocked list", author in blocked, blocked)
            flagged = {m["author_id"]: m["author_blocked"] for m in admin("GET", "/chat/reported-messages")[1] or []}
            check("reported list shows the author as blocked", flagged.get(author) is True, flagged)
            last = (admin("GET", "/chat/actions", params={"limit": 1})[1] or [{}])[0]
            check("action log: block by this admin",
                  (last.get("action"), last.get("user_id"), last.get("admin_email")) == ("block", author, me.get("email")), last)

            expect("unblock the author", admin("POST", f"/chat/users/{author}/unblock"), 200)
            blocked = [u["user_id"] for u in admin("GET", "/chat/blocked-users")[1] or []]
            check("author is no longer blocked", author not in blocked, blocked)
            last = (admin("GET", "/chat/actions", params={"limit": 1})[1] or [{}])[0]
            check("action log: unblock by this admin", (last.get("action"), last.get("user_id")) == ("unblock", author), last)

    section("Clean end")
    clean()
    snap = snapshot()
    check("tables empty again", snap["requests"] == [] and snap["blocked"] == [], _key(snap))
    consistent("clean end")

    print(f"\n{passed} passed, {len(failed)} failed")
    for name in failed:
        print(f"  FAILED: {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
