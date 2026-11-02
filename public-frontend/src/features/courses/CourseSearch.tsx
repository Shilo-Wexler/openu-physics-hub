import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

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
  // The row the arrow keys point at, with the search it belongs to. Nothing is marked until an
  // arrow is pressed, and a new search clears the mark (checked while rendering, so there is no
  // extra render).
  const [active, setActive] = useState<{ query: string; index: number | null }>({
    query: "",
    index: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // The search appears when the reader asks for it ("a course"), so typing can start right away.
  // Only with a mouse: on a touch screen the keyboard would pop up and cover the list.
  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  // The index is rebuilt only when the course list itself changes, not on every keystroke.
  const search = useMemo(() => createCourseSearch(courses), [courses]);
  const results = search(query);
  const index =
    active.query === query && active.index !== null
      ? Math.min(active.index, results.length - 1)
      : null;
  const current = index === null ? undefined : results[index];

  // Arrows move between the results and Enter picks one, so the mouse is not needed at all.
  // Not a <form>: the search can sit inside another form (the inquiry form), and forms cannot
  // be nested.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // The first press marks the first row; later presses move from there.
      const next = index === null ? 0 : Math.max(0, Math.min(results.length - 1, index + step));
      setActive({ query, index: next });
      // Keeps the row the arrows reached in sight. Done here and not after every render, so
      // opening the search never scrolls the page by itself.
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault(); // also keeps Enter from submitting a surrounding form
    // The marked row, or the best match when the arrows were not used.
    const picked = current ?? results[0];
    if (picked) onSelect(picked);
  }

  return (
    <div className={styles.container}>
      <div role="search">
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="חיפוש לפי שם או מספר קורס"
          aria-label="חיפוש קורס"
          aria-controls={listId}
          aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
          autoComplete="off"
        />
      </div>

      <p className={styles.count} aria-live="polite">
        {results.length === 0 ? "לא נמצאו קורסים" : `${results.length} קורסים`}
      </p>

      <ul ref={listRef} id={listId} className={styles.list}>
        {results.map((course) => (
          <li key={course.id}>
            <button
              id={`${listId}-${course.id}`}
              className={`${styles.item} ${course === current ? styles.active : ""}`}
              type="button"
              onClick={() => onSelect(course)}
            >
              <span className={styles.name}>{course.name}</span>
              <span className={styles.number}>{course.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
