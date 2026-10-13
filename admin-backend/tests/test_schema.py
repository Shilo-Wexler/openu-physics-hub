"""DB-level rules from db/migrations/001_init.sql, checked directly against Postgres (not through the API)."""

import psycopg
import pytest
from psycopg import errors

from conftest import TEST_DATABASE_URL, courses_from_csv, run_sql

INSERT = (
    "insert into requests (full_name, email, course_name, body, status, is_opened) "
    "values (%(full_name)s, %(email)s, %(course_name)s, %(body)s, %(status)s, %(is_opened)s) returning id"
)


def insert(**overrides) -> int:
    row = {
        "full_name": "a", "email": "a@b.c", "course_name": "כללי", "body": "x",
        "status": "new", "is_opened": False,
    }
    row.update(overrides)
    return run_sql(INSERT, row)[0][0]


def rejected_by(exc_type, **overrides) -> str:
    """Inserts a row that must fail with exc_type; returns the name of the constraint that rejected it."""
    with pytest.raises(exc_type) as e:
        insert(**overrides)
    return e.value.diag.constraint_name


def test_courses_loaded_from_shared_csv():
    names = {name for (name,) in run_sql("select name from courses")}
    assert len(names) == len(courses_from_csv())  # row 0 of the CSV is "general"
    assert "כללי" in names
    assert run_sql("select course_number from courses where name = 'כללי'") == [(0,)]
    assert run_sql("select course_number from courses where name = 'מכניקה'") == [(20215,)]


def test_defaults():
    request_id = insert()
    status, is_opened, created_at = run_sql(
        "select status, is_opened, created_at from requests where id = %s", (request_id,)
    )[0]
    assert (status, is_opened) == ("new", False)
    assert created_at is not None


def test_unknown_course_rejected():
    assert rejected_by(errors.ForeignKeyViolation, course_name="קורס שלא קיים")


def test_body_length():
    insert(body="א" * 5000)  # 5000 Hebrew characters is the maximum
    assert rejected_by(errors.CheckViolation, body="א" * 5001) == "requests_body_check"
    assert rejected_by(errors.CheckViolation, body="   ") == "requests_body_check"


@pytest.mark.parametrize("email", ["Student@Gmail.com", "not-an-email", "a@b c"])
def test_bad_email_rejected(email):
    assert rejected_by(errors.CheckViolation, email=email) == "requests_email_check"


def test_name_length():
    assert rejected_by(errors.CheckViolation, full_name="a" * 101) == "requests_full_name_check"


def test_unknown_status_rejected():
    # is_opened=True, so only the status check can reject this row.
    assert rejected_by(errors.CheckViolation, status="pending", is_opened=True) == "requests_status_check"


def test_closed_only_after_read():
    assert (
        rejected_by(errors.CheckViolation, status="closed", is_opened=False)
        == "requests_closed_only_after_opened"
    )
    insert(status="closed", is_opened=True)


@pytest.mark.student
def test_blocked_email_rejected_by_trigger():
    """STUDENT-SIDE: the trigger exists only to stop blocked senders from submitting."""
    run_sql("insert into blocked_emails (email) values ('spam@b.c')")
    with pytest.raises(errors.RaiseException, match="sender is blocked"):
        insert(email="spam@b.c")


def test_course_rename_cascades():
    request_id = insert(course_name="מכניקה")
    try:
        run_sql("update courses set name = 'מכניקה (שם חדש)' where name = 'מכניקה'")
        assert run_sql("select course_name from requests where id = %s", (request_id,)) == [("מכניקה (שם חדש)",)]
    finally:
        # Courses are not reset between tests, so put the name back.
        run_sql("update courses set name = 'מכניקה' where name = 'מכניקה (שם חדש)'")


def test_course_in_use_cannot_be_deleted():
    insert(course_name="מכניקה")
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        with pytest.raises(errors.ForeignKeyViolation):
            conn.execute("delete from courses where name = 'מכניקה'")


@pytest.mark.parametrize(
    "action, message_id, user_id",
    [
        ("remove", None, None),                                             # no target
        ("block", 1, None),                                                 # user action with a message
        ("dismiss", None, "282a1af8-19c7-44ad-ab32-a3f800c83450"),          # message action with a user
    ],
)
def test_moderation_action_needs_the_right_target(action, message_id, user_id):
    with pytest.raises(errors.CheckViolation) as e:
        run_sql(
            "insert into moderation_actions (admin_email, action, message_id, user_id) values ('a@b.c', %s, %s, %s)",
            (action, message_id, user_id),
        )
    assert e.value.diag.constraint_name == "moderation_actions_target"


def test_admin_added_by_must_be_lowercase():
    with pytest.raises(errors.CheckViolation):
        run_sql("insert into admins (email, added_by) values ('x@b.c', 'Someone@B.c')")


@pytest.mark.parametrize("roles", [[], ["owner"], ["admin", "root"]])
def test_admin_roles_must_be_known_and_not_empty(roles):
    with pytest.raises(errors.CheckViolation):
        run_sql("insert into admins (email, roles) values ('x@b.c', %s)", (roles,))


def test_admin_added_by_hand_defaults_to_full_admin():
    run_sql("insert into admins (email) values ('hand@b.c')")
    assert run_sql("select roles from admins where email = 'hand@b.c'") == [(["admin"],)]
