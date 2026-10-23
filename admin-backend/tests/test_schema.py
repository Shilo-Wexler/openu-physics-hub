"""DB-level rules from db/migrations/, checked directly against Postgres (not through the API)."""

import psycopg
import pytest
from psycopg import errors

from conftest import TEST_DATABASE_URL, courses_from_csv, run_sql

MECHANICS = 20215  # course_number of מכניקה in shared/courses.csv


def test_courses_loaded_from_shared_csv():
    names = {name for (name,) in run_sql("select name from courses")}
    assert len(names) == len(courses_from_csv())  # row 0 of the CSV is "general"
    assert "כללי" in names
    assert run_sql("select course_number from courses where name = 'כללי'") == [(0,)]
    assert run_sql("select course_number from courses where name = 'מכניקה'") == [(MECHANICS,)]


def test_course_in_use_cannot_be_deleted(add_inquiry):
    add_inquiry(course_number=MECHANICS)
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        with pytest.raises(errors.ForeignKeyViolation):
            conn.execute("delete from courses where course_number = %s", (MECHANICS,))


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
    