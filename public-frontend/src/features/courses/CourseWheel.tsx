/** A 3D course picker, like the iOS date wheel: the best match for the query spins to the middle. */

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from "react";

import type { Course } from "../../shared/api/chat";
import { createCourseSearch } from "./searchCourses";
import styles from "./CourseWheel.module.css";

const ROW_HEIGHT = 48; // px, same as .row height in the CSS
const ROW_ANGLE = 18; // degrees between rows: smaller is a flatter wheel
const MAX_OFFSET = 4; // rows drawn above and below the middle
const RADIUS = ROW_HEIGHT / (2 * Math.tan(((ROW_ANGLE / 2) * Math.PI) / 180));
const WHEEL_HEIGHT = Math.round(
  2 * RADIUS * Math.sin((((MAX_OFFSET + 0.5) * ROW_ANGLE) * Math.PI) / 180),
);
const FLAT_OFFSET = 2; // reduced motion: a flat list of five rows
const FLAT_HEIGHT = (2 * FLAT_OFFSET + 1) * ROW_HEIGHT;
const SPIN_ROWS = 10; // how far the wheel rolls in when the results change
const SPIN_MS = 520;
const TAP_SLOP = 5; // px a pointer may move and still count as a tap

/** Lets the search box drive the wheel with the arrow keys and Enter. */
export interface WheelControls {
  move(delta: number): void;
  openCurrent(): void;
}

interface Props {
  courses: Course[];
  query: string;
  onOpen: (course: Course) => void;
  controls?: Ref<WheelControls>;
}

interface Drag {
  startY: number;
  startPosition: number;
  lastY: number;
  lastTime: number;
  velocity: number; // rows per ms
  moved: boolean;
}

/** With enough rows the wheel is endless: after the last course comes the first. */
function loops(count: number): boolean {
  return count >= 2 * MAX_OFFSET + 2;
}

function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/**
 * Orders ranked results from the middle outwards: the best match in the middle, then
 * the 2nd above it, the 3rd below it, the 4th above again, and so on. The best matches
 * stay closest to the middle on both sides, and the wheel is full even with few results.
 */
function centerOut<T>(ranked: T[]): T[] {
  const middle = Math.floor(ranked.length / 2);
  const arranged = new Array<T>(ranked.length);
  ranked.forEach((item, rank) => {
    const distance = Math.ceil(rank / 2);
    arranged[rank % 2 === 1 ? middle - distance : middle + distance] = item;
  });
  return arranged;
}

export default function CourseWheel({ courses, query, onOpen, controls }: Props) {
  const search = useMemo(() => createCourseSearch(courses), [courses]);
  const searching = query.trim() !== "";
  // An empty search keeps the list's own order; a search is arranged around the best match.
  const results = useMemo(() => {
    const found = search(query);
    return searching ? centerOut(found) : found;
  }, [search, query, searching]);
  const count = results.length;
  const bestIndex = searching ? Math.floor(count / 2) : 0;

  // position: which row is in the middle, as a fraction while the wheel turns.
  const [position, setPosition] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [flat] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const positionRef = useRef(0);
  const frameRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  function place(value: number) {
    positionRef.current = value;
    setPosition(value);
  }

  function clamp(value: number): number {
    return loops(count) ? value : Math.max(0, Math.min(count - 1, value));
  }

  function currentCourse(): Course | undefined {
    if (count === 0) return undefined;
    const index = Math.round(positionRef.current);
    return results[loops(count) ? wrap(index, count) : Math.max(0, Math.min(count - 1, index))];
  }

  function settle(announce: boolean) {
    if (count === 0) return;
    if (loops(count)) place(wrap(positionRef.current, count));
    const course = currentCourse();
    if (announce && course) setAnnouncement(`${course.name}, ${course.id}`);
  }

  function animateTo(target: number, ms: number, announce = true) {
    cancelAnimationFrame(frameRef.current);
    const end = clamp(target);
    if (flat || ms <= 0) {
      place(end);
      settle(announce);
      return;
    }
    const from = positionRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / ms);
      place(from + (end - from) * (1 - (1 - progress) ** 3)); // ease-out: fast, then gentle
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
      else settle(announce);
    };
    frameRef.current = requestAnimationFrame(step);
  }

  function openCurrent() {
    const course = currentCourse();
    if (course) onOpen(course);
  }

  useImperativeHandle(controls, () => ({
    move: (delta) => animateTo(Math.round(positionRef.current) + delta, 180),
    openCurrent,
  }));

  // New results: roll in from below and land on the best match.
  useEffect(() => {
    place(bestIndex - SPIN_ROWS);
    animateTo(bestIndex, SPIN_MS, searching);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the results change
  }, [results]);

  // The mouse wheel turns the wheel. React's onWheel cannot stop the page from
  // scrolling (it is passive), so the listener is added by hand.
  useEffect(() => {
    const element = wheelRef.current;
    if (!element) return;
    let snapTimer = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(frameRef.current);
      const pixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      place(clamp(positionRef.current + pixels / ROW_HEIGHT));
      clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => animateTo(Math.round(positionRef.current), 160), 110);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      clearTimeout(snapTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-added when the results change
  }, [results]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    cancelAnimationFrame(frameRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startPosition: positionRef.current,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const moved = event.clientY - drag.startY;
    if (Math.abs(moved) > TAP_SLOP) drag.moved = true;
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    // Smoothed, so one jittery event does not decide how far a fling goes.
    drag.velocity =
      0.7 * drag.velocity + 0.3 * (-(event.clientY - drag.lastY) / ROW_HEIGHT / elapsed);
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    place(clamp(drag.startPosition - moved / ROW_HEIGHT));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      // A fling keeps rolling a little, then lands on a whole row.
      const target = Math.round(positionRef.current + drag.velocity * 260);
      animateTo(target, 280 + Math.min(520, Math.abs(target - positionRef.current) * 45));
      return;
    }
    // A tap: the middle row opens; any other row spins to the middle.
    const box = event.currentTarget.getBoundingClientRect();
    const fromMiddle = event.clientY - (box.top + box.height / 2);
    const rows = flat
      ? Math.round(fromMiddle / ROW_HEIGHT)
      : Math.round(
          (Math.asin(Math.max(-1, Math.min(1, fromMiddle / RADIUS))) * 180) / Math.PI / ROW_ANGLE,
        );
    if (rows === 0) openCurrent();
    else animateTo(Math.round(positionRef.current) + rows, 240);
  }

  function handlePointerCancel() {
    if (!dragRef.current) return;
    dragRef.current = null;
    animateTo(Math.round(positionRef.current), 160);
  }

  if (count === 0) {
    return <p className={styles.empty}>לא מצאנו קורס כזה. נסו שם אחר או מספר קורס.</p>;
  }

  // Only the rows near the middle are drawn, never the whole list.
  const maxOffset = flat ? FLAT_OFFSET : MAX_OFFSET;
  const rows = [];
  for (let index = 0; index < count; index++) {
    let offset = index - position;
    if (loops(count)) offset = wrap(offset + count / 2, count) - count / 2;
    const course = results[index];
    if (!course || Math.abs(offset) > maxOffset + 0.5) continue;
    const transform = flat
      ? `translateY(${offset * ROW_HEIGHT}px)`
      : `rotateX(${-offset * ROW_ANGLE}deg) translateZ(${RADIUS}px)`;
    rows.push(
      <div
        key={course.id}
        className={Math.abs(offset) < 0.5 ? `${styles.row} ${styles.current}` : styles.row}
        style={{ transform, opacity: Math.max(0, 1 - Math.abs(offset) * 0.2) }}
      >
        <span className={styles.name}>{course.name}</span>
        <span className={styles.number}>{course.id}</span>
      </div>,
    );
  }

  return (
    <div className={styles.panel}>
      {/* Hidden from screen readers: they get the search box and the announcement below. */}
      <div
        ref={wheelRef}
        className={styles.wheel}
        style={{ height: flat ? FLAT_HEIGHT : WHEEL_HEIGHT }}
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className={styles.band} />
        <div
          className={styles.drum}
          style={flat ? undefined : { transform: `translateZ(${-RADIUS}px)` }}
        >
          {rows}
        </div>
      </div>
      <p className={styles.hint} aria-hidden="true">
        Enter או הקשה לפתיחה
      </p>
      <p className={styles.visuallyHidden} aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
