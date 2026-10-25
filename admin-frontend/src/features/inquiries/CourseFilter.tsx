/** The course filter above the inquiry list: a search box whose results open under it, like the site's course
    search. Closed, it shows the chosen course, with a button that clears it. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { listCourses, type Course } from "../../shared/api/courses";
import { courseLabel } from "../../shared/lib/inquiryLabels";
import { createCourseSearch } from "../../shared/lib/searchCourses";
import { useAdmin, useLoad } from "../../layout/consoleContext";
import styles from "./CourseFilter.module.css";

const RESULTS_ID = "course-filter-results";

// A magnifying glass, drawn like the bottom bar's icons.
const SEARCH_ICON = ["M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0", "m21 21-4.3-4.3"];

interface Props {
  /** The chosen course number; null = every course. */
  value: number | null;
  onChange: (course: number | null) => void;
}

export default function CourseFilter({ value, onChange }: Props) {
  const { token } = useAdmin();
  const courses = useLoad((signal) => listCourses(token, signal), [token]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only courses with a number can be filtered on. The search index is built once per course list.
  const numbered = useMemo(() => (courses.data ?? []).filter((c) => c.course_number !== null), [courses.data]);
  const search = useMemo(() => createCourseSearch(numbered), [numbered]);
  const results = open ? search(query) : [];

  const chosen = numbered.find((c) => c.course_number === value);
  const chosenLabel = chosen ? courseLabel(chosen.course_number, chosen.name) : value === null ? "" : String(value);
  // Blue while a course filters the list, so a filtered list is never mistaken for the whole queue.
  const active = !open && value !== null;

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(course: Course) {
    onChange(course.course_number);
    close();
    inputRef.current?.blur(); // also puts the phone's keyboard away
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
      inputRef.current?.blur();
    } else if (event.key === "Enter" && results[0]) {
      choose(results[0]);
    }
  }

  // A tap anywhere outside closes the results. Not on blur: on a phone, the tap on a result
  // can blur the box before the result gets its click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      // Tab to something outside (keyboard) closes too. relatedTarget is where the focus went.
      onBlur={(e) => {
        if (e.relatedTarget && !wrapRef.current?.contains(e.relatedTarget)) close();
      }}
    >
      <div className={active ? `${styles.field} ${styles.active}` : styles.field}>
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          {SEARCH_ICON.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          className={styles.input}
          value={open ? query : chosenLabel}
          placeholder="סינון לפי קורס"
          aria-label="סינון לפי קורס"
          aria-expanded={open}
          aria-controls={RESULTS_ID}
          enterKeyHint="search"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {active && (
          <button type="button" className={styles.clear} onClick={() => onChange(null)} aria-label="ניקוי סינון הקורס">
            ✕
          </button>
        )}
      </div>

      {open && (
        <div id={RESULTS_ID} className={styles.results}>
          {courses.loading && <p className={styles.note}>טוען…</p>}
          {courses.failed && <p className={styles.note}>לא הצלחנו לטעון את הקורסים.</p>}
          {courses.data && results.length === 0 && <p className={styles.note}>לא נמצא קורס.</p>}
          {results.length > 0 && (
            <ul className={styles.list}>
              {results.map((course) => (
                <li key={course.course_number}>
                  <button
                    type="button"
                    className={course.course_number === value ? `${styles.option} ${styles.current}` : styles.option}
                    onClick={() => choose(course)}
                  >
                    <span className={styles.name}>{course.name}</span>
                    {/* The general row (0) has no number to show. */}
                    {course.course_number !== 0 && <span className={styles.number}>{course.course_number}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
