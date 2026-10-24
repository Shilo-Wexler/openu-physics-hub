import { useMemo, useState, type KeyboardEvent } from "react";

import type { Course } from "../../shared/api/chat";
import { createCourseSearch } from "./searchCourses";
import styles from "./CourseSearch.module.css";

interface Props {
  courses: Course[];
  /** Called with the course the user picked (e.g. in the inquiry form). */
  onSelect: (course: Course) => void;
}

export default function CourseSearch({ courses, onSelect }: Props) {
  const [query, setQuery] = useState("");

  // The index is rebuilt only when the course list itself changes, not on every keystroke.
  const search = useMemo(() => createCourseSearch(courses), [courses]);
  const results = search(query);

  // Enter picks the best match, so the mouse is not needed at all. Not a <form>: the search
  // can sit inside another form (the inquiry form), and forms cannot be nested.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault(); // also keeps Enter from submitting a surrounding form
    const first = results[0];
    if (first) onSelect(first);
  }

  return (
    <div className={styles.container}>
      <div role="search">
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="חיפוש לפי שם או מספר קורס"
          aria-label="חיפוש קורס"
          autoComplete="off"
        />
      </div>

      <p className={styles.count} aria-live="polite">
        {results.length === 0 ? "לא נמצאו קורסים" : `${results.length} קורסים`}
      </p>

      <ul className={styles.list}>
        {results.map((course) => (
          <li key={course.id}>
            <button className={styles.item} type="button" onClick={() => onSelect(course)}>
              <span className={styles.name}>{course.name}</span>
              <span className={styles.number}>{course.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
