import { useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";

import type { Course } from "../../shared/api/chat";
import { createCourseSearch } from "./searchCourses";
import styles from "./CourseSearch.module.css";

interface Props {
  courses: Course[];
  /**
   * Picks a course instead of opening its page (e.g. in the inquiry form): results become
   * buttons that call this. Without it, results are links to the course pages.
   */
  onSelect?: (course: Course) => void;
  /** Text to start with, e.g. what was typed in the home page's search box. */
  initialQuery?: string;
}

export default function CourseSearch({ courses, onSelect, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const navigate = useNavigate();

  // The index is rebuilt only when the course list itself changes, not on every keystroke.
  const search = useMemo(() => createCourseSearch(courses), [courses]);
  const results = search(query);

  function choose(course: Course) {
    if (onSelect) onSelect(course);
    else void navigate(`/courses/${course.id}`);
  }

  // Enter picks the best match, so the mouse is not needed at all. Not a <form>: the search
  // can sit inside another form (the inquiry form), and forms cannot be nested.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault(); // also keeps Enter from submitting a surrounding form
    const first = results[0];
    if (first) choose(first);
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
        {results.map((course) => {
          const label = (
            <>
              <span className={styles.name}>{course.name}</span>
              <span className={styles.number}>{course.id}</span>
            </>
          );
          return (
            <li key={course.id}>
              {onSelect ? (
                <button className={styles.item} type="button" onClick={() => onSelect(course)}>
                  {label}
                </button>
              ) : (
                <Link className={styles.item} to={`/courses/${course.id}`}>
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
 