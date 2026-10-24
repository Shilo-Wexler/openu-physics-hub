/** /courses: pick a course on the wheel to open its chat. */

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

import type { Course } from "../../shared/api/chat";
import { loadCourses } from "./courseList";
import CourseWheel, { type WheelControls } from "./CourseWheel";
import styles from "./CoursesPage.module.css";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; courses: Course[] };

export default function CoursesPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  // ?q= lets a link open the page with a search already typed.
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const wheel = useRef<WheelControls>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The request is shared, so it is not aborted; a page that has left ignores the answer.
    let active = true;
    loadCourses()
      .then((courses) => {
        if (active) setState({ status: "ready", courses });
      })
      .catch((error: unknown) => {
        if (active) {
          console.error(error);
          setState({ status: "error" });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // With a mouse, typing can start right away. Not on touch screens: the keyboard
  // would pop up and cover the wheel before the user asked for it.
  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      input.current?.focus();
    }
  }, []);

  function openCourse(course: Course) {
    navigate(`/courses/${course.id}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    wheel.current?.openCurrent();
  }

  // The arrow keys turn the wheel while typing stays in the search box.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      wheel.current?.move(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>צ'אט קורסים</h1>
        <p className={styles.lead}>אפשר לבחור קורס, לקרוא ביקורות ולכתוב.</p>
      </header>

      <form role="search" className={styles.search} onSubmit={handleSubmit}>
        <svg className={styles.searchIcon} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <label htmlFor="course-search" className={styles.visuallyHidden}>
          חיפוש קורס
        </label>
        <input
          ref={input}
          id="course-search"
          type="search"
          className={styles.searchInput}
          placeholder="חיפוש לפי שם או מספר קורס"
          enterKeyHint="go"
          autoComplete="off"
          aria-describedby="course-search-hint"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </form>
      <p id="course-search-hint" className={styles.visuallyHidden}>
        החצים למעלה ולמטה מחליפים קורס, ו-Enter פותח אותו.
      </p>

      {/* Keeps the wheel's space while the list loads, so nothing jumps. */}
      <div className={styles.wheelSlot}>
        {state.status === "loading" && <p className={styles.message}>טוען קורסים…</p>}
        {state.status === "error" && (
          <p className={styles.message}>לא הצלחנו לטעון את הקורסים. אפשר לרענן את הדף ולנסות שוב.</p>
        )}
        {state.status === "ready" && (
          <CourseWheel
            courses={state.courses}
            query={query}
            onOpen={openCourse}
            controls={wheel}
          />
        )}
      </div>
    </>
  );
}
