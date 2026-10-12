import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import type { Course } from "../../shared/api/chat";
import { createCourseSearch } from "./searchCourses";
import styles from "./CourseSearch.module.css";

interface Props {
  courses: Course[];
}

export default function CourseSearch({ courses }: Props) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // The index is rebuilt only when the course list itself changes, not on every keystroke.
  const search = useMemo(() => createCourseSearch(courses), [courses]);
  const results = search(query);

  // Enter opens the best match, so the mouse is not needed at all.
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const first = results[0];
    if (first) {
      void navigate(`/courses/${first.id}`);
    }
  }

  return (
    <div className={styles.container}>
      <form role="search" onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש לפי שם או מספר קורס"
          aria-label="חיפוש קורס"
          autoComplete="off"
        />
      </form>

      <p className={styles.count} aria-live="polite">
        {results.length === 0 ? "לא נמצאו קורסים" : `${results.length} קורסים`}
      </p>

      <ul className={styles.list}>
        {results.map((course) => (
          <li key={course.id}>
            <Link className={styles.item} to={`/courses/${course.id}`}>
              <span className={styles.name}>{course.name}</span>
              <span className={styles.number}>{course.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
