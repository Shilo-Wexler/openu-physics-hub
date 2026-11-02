/** The course list beside a course page on a computer: a search box, the general chat and
    every course, with the open one marked. Switching course is one click, without /courses. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";

import { GENERAL_COURSE_ID, type Course } from "../../shared/api/chat";
import { loadCourses } from "../courses/courseList";
import { createCourseSearch } from "../courses/searchCourses";
import { coursePath } from "./share";
import styles from "./CourseNav.module.css";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; courses: Course[] };

interface Props {
  /** The course whose page is open (GENERAL_COURSE_ID for the general chat). */
  currentId: number;
}

export default function CourseNav({ currentId }: Props) {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  // The row the arrow keys point at (its index in results), or -1 for none.
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // The request is shared (loadCourses), so it is not aborted; a page that has left ignores the answer.
    let live = true;
    loadCourses()
      .then((courses) => {
        if (live) setState({ status: "ready", courses });
      })
      .catch((error: unknown) => {
        if (live) {
          console.error(error);
          setState({ status: "error" });
        }
      });
    return () => {
      live = false;
    };
  }, []);

  // The general chat has its own row above the list, so it is not repeated among the courses.
  const courses = useMemo(
    () => (state.status === "ready" ? state.courses.filter((c) => c.id !== GENERAL_COURSE_ID) : []),
    [state],
  );
  // The index is rebuilt only when the list itself changes, not on every keystroke.
  const search = useMemo(() => createCourseSearch(courses), [courses]);
  const searching = query.trim() !== "";
  const results = searching ? search(query) : courses;

  // Once the list is there, scroll it (only the list, not the page) so the open course is in sight.
  useLayoutEffect(() => {
    const element = list.current;
    const current = element?.querySelector<HTMLElement>("[aria-current='page']");
    if (!element || !current) return;
    element.scrollTop = current.offsetTop - element.clientHeight / 2 + current.offsetHeight / 2;
  }, [courses]);

  // Keeps the row the arrows point at in sight, scrolling only the list.
  useLayoutEffect(() => {
    const element = list.current;
    const row = element?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!element || !row) return;
    if (row.offsetTop < element.scrollTop) {
      element.scrollTop = row.offsetTop;
    } else if (row.offsetTop + row.offsetHeight > element.scrollTop + element.clientHeight) {
      element.scrollTop = row.offsetTop + row.offsetHeight - element.clientHeight;
    }
  }, [active]);

  function changeQuery(next: string) {
    setQuery(next);
    // A new search points at its best match, so Enter alone opens it.
    setActive(next.trim() === "" ? -1 : 0);
  }

  // The arrow keys move through the rows while typing stays in the box; Enter opens the row
  // they point at (or the best match), so the mouse is not needed at all.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => Math.max(0, Math.min(results.length - 1, current + step)));
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const course = results[active] ?? results[0];
    if (course) {
      changeQuery("");
      navigate(coursePath(course.id));
    }
  }

  return (
    <nav className={styles.nav} aria-label="קורסים">
      <div role="search">
        <input
          className={styles.search}
          type="search"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="חיפוש קורס"
          aria-label="חיפוש קורס"
          aria-describedby="course-nav-hint"
          autoComplete="off"
        />
      </div>
      <p id="course-nav-hint" className={styles.visuallyHidden}>
        החצים למעלה ולמטה עוברים בין הקורסים, ו-Enter פותח את הקורס.
      </p>

      {!searching && (
        <Link
          to={coursePath(GENERAL_COURSE_ID)}
          className={styles.item}
          aria-current={currentId === GENERAL_COURSE_ID ? "page" : undefined}
        >
          <span className={styles.name}>צ'אט כללי</span>
        </Link>
      )}

      <p className={styles.group}>קורסים</p>

      {state.status === "loading" && <p className={styles.message}>טוען קורסים…</p>}
      {state.status === "error" && <p className={styles.message}>לא הצלחנו לטעון את הקורסים.</p>}
      {state.status === "ready" && results.length === 0 && (
        <p className={styles.message}>לא נמצאו קורסים</p>
      )}

      <ul ref={list} className={styles.list}>
        {results.map((course, index) => (
          <li key={course.id} data-index={index}>
            <Link
              to={coursePath(course.id)}
              className={index === active ? `${styles.item} ${styles.active}` : styles.item}
              aria-current={course.id === currentId ? "page" : undefined}
              onClick={() => changeQuery("")}
            >
              <span className={styles.name}>{course.name}</span>
              <span className={styles.number}>{course.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
