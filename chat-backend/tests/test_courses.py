"""Course list, course page and ratings."""

MISSING_COURSE = 999999999


def rate(student, course_id, difficulty, recommendation):
    return student.put(
        f"/courses/{course_id}/rating",
        json={"difficulty": difficulty, "recommendation": recommendation},
    )


def test_guest_sees_course_list(guest, course_id):
    response = guest.get("/courses")
    assert response.status_code == 200
    course = next(c for c in response.json() if c["id"] == course_id)
    # No ratings yet: no average, zero count.
    assert course["avg_difficulty"] is None
    assert course["ratings_count"] == 0


def test_unknown_course_is_404(sign_in, guest):
    assert guest.get(f"/courses/{MISSING_COURSE}").status_code == 404
    assert rate(sign_in("alice"), MISSING_COURSE, 3, 3).status_code == 404


def test_ratings_are_averaged(sign_in, guest, course_id):
    assert rate(sign_in("alice"), course_id, 2, 4).status_code == 200
    assert rate(sign_in("bob"), course_id, 4, 5).status_code == 200
    course = guest.get(f"/courses/{course_id}").json()
    assert course["avg_difficulty"] == 3
    assert course["avg_recommendation"] == 4.5
    assert course["ratings_count"] == 2


def test_rating_again_replaces_own_rating(sign_in, course_id):
    alice = sign_in("alice")
    rate(alice, course_id, 1, 1)
    rate(alice, course_id, 5, 5)
    course = alice.get(f"/courses/{course_id}").json()
    assert course["ratings_count"] == 1
    assert course["my_rating"] == {"difficulty": 5, "recommendation": 5}


def test_my_rating_is_null_for_guest_and_unrated(sign_in, guest, course_id):
    rate(sign_in("alice"), course_id, 3, 3)
    assert guest.get(f"/courses/{course_id}").json()["my_rating"] is None
    assert sign_in("bob").get(f"/courses/{course_id}").json()["my_rating"] is None


def test_rating_out_of_range_is_422(sign_in, course_id):
    alice = sign_in("alice")
    assert rate(alice, course_id, 0, 3).status_code == 422
    assert rate(alice, course_id, 3, 6).status_code == 422


def test_guest_cannot_rate(guest, course_id):
    assert rate(guest, course_id, 3, 3).status_code == 401