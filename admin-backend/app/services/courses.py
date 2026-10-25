"""The course list (loaded from shared/courses.csv), for the console's filters."""

from psycopg import Connection


def list_active(conn: Connection) -> list[dict]:
    return conn.execute(
        "select name, course_number from courses where is_active order by course_number nulls first"
    ).fetchall()