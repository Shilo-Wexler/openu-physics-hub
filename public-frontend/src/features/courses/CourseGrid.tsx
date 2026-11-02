/** /courses on a computer: every course as a tile in a grid, filtered by the search box above it.
    The phone keeps the wheel (CourseWheel); CoursesPage picks one by screen size. */

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Link } from "react-router";

import { GENERAL_COURSE_ID, type Course } from "../../shared/api/chat";
import { createCourseSearch } from "./searchCourses";
import styles from "./CourseGrid.module.css";

/** Tiles per row; CourseGrid.module.css has the same number. Up and down move by a whole row. */
export const GRID_COLUMNS = 3;

// Without a search, only the first rows show, with a button for the rest: a wall of every course
// says little, and most visitors search for one anyway. A search always looks through all of them.
const PREVIEW_ROWS = 4;

/** What CoursesPage drives from the search box, so typing never leaves it. */
export interface GridControls {
  /** Moves the marked tile: +1 / -1 to the next / previous tile, +-GRID_COLUMNS a row down / up. */
  move: (step: number) => void;
  /** Opens the marked tile, or the best match when none is marked. */
  openCurrent: () => void;
}

interface Props {
  courses: Course[];
  query: string;
  onOpen: (course: Course) => void;
  controls: Ref<GridControls>;
}

export default function CourseGrid({ courses, query, onOpen, controls }: Props) {
  // The general chat has its own page; it is not a course to pick here.
  const pickable = useMemo(() => courses.filter((c) => c.id !== GENERAL_COURSE_ID), [courses]);
  // The index is rebuilt only when the list itself changes, not on every keystroke.
  const search = useMemo(() => createCourseSearch(pickable), [pickable]);
  const searching = query.trim() !== "";
  const [expanded, setExpanded] = useState(false);
  const preview = PREVIEW_ROWS * GRID_COLUMNS;
  const cut = !searching && !expanded && pickable.length > preview;
  const results = searching ? search(query) : cut ? pickable.slice(0, preview) : pickable;

  // The tile the arrow keys point at (its index in results), or -1 for none. A new search points
  // at its best match, so Enter alone opens it; the empty box marks nothing.
  const [active, setActive] = useState({ query, index: searching ? 0 : -1 });
  if (active.query !== query) setActive({ query, index: searching ? 0 : -1 });
  const index = active.index;

  useImperativeHandle(controls, () => ({
    move(step) {
      if (results.length === 0) return;
      // From nothing marked, any arrow starts at the first tile.
      const next = index < 0 ? 0 : Math.max(0, Math.min(results.length - 1, index + step));
      setActive({ query, index: next });
    },
    openCurrent() {
      const course = results[index] ?? results[0];
      if (course) onOpen(course);
    },
  }));

  // Keeps the marked tile in view when the arrows move it past the window's edge.
  const grid = useRef<HTMLUListElement>(null);
  useEffect(() => {
    grid.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return (
    <>
      <p className={styles.count} aria-live="polite">
        {searching && results.length === 0
          ? "לא נמצאו קורסים"
          : `${searching ? results.length : pickable.length} קורסים`}
      </p>
      <ul ref={grid} className={styles.grid}>
        {results.map((course, i) => (
          <li key={course.id} data-index={i}>
            <Link
              to={`/courses/${course.id}`}
              className={i === index ? `${styles.tile} ${styles.active}` : styles.tile}
            >
              <span className={styles.name}>{course.name}</span>
              <span className={styles.number}>{course.id}</span>
            </Link>
          </li>
        ))}
      </ul>
      {cut && (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          הצגת כל {pickable.length} הקורסים
        </button>
      )}
    </>
  );
}
