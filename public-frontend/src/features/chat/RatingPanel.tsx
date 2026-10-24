/** Course averages as stars, and the signed-in reader's own rating (difficulty + recommendation, 1-5). */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { rateCourse, type CourseDetails, type Rating } from "../../shared/api/chat";
import { useAuth } from "../auth/AuthContext";
import Stars, { STAR_PATH } from "./Stars";
import styles from "./RatingPanel.module.css";

const SCORES = [1, 2, 3, 4, 5] as const;
// Right to left: the left arrow goes to the next (higher) score.
const ARROW_STEPS: Record<string, number> = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 };

// open: picking stars. collapsed: "rate the course" only. saved: a summary with "edit".
type Mode = "open" | "collapsed" | "saved";

interface Props {
  course: CourseDetails;
  /** Replaces the page's copy of the course: new averages and my_rating. */
  onChange: (course: CourseDetails) => void;
}

export default function RatingPanel({ course, onChange }: Props) {
  const { requireSignIn } = useAuth();
  const mine = course.my_rating;
  // A returning rater sees their rating; anyone else sees the open box, as an invitation.
  const [mode, setMode] = useState<Mode>(mine === null ? "open" : "saved");
  const [difficulty, setDifficulty] = useState(mine?.difficulty ?? null);
  const [recommendation, setRecommendation] = useState(mine?.recommendation ?? null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleId = useId();

  // The button that was clicked disappears when the mode changes, so focus moves to the
  // new state's main element; otherwise keyboard users would land back at the top of the page.
  const boxRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const target = { open: boxRef, collapsed: openRef, saved: editRef }[mode];
    target.current?.focus();
  }, [mode]);

  const complete = difficulty !== null && recommendation !== null;
  const changed =
    mine === null || difficulty !== mine.difficulty || recommendation !== mine.recommendation;

  function pick(set: (score: number) => void, score: number) {
    if (!requireSignIn()) return;
    setFailed(false);
    set(score);
  }

  // Closes the box without saving: back to the saved rating, or folded away if there is none.
  function close() {
    setFailed(false);
    if (mine === null) {
      setMode("collapsed");
    } else {
      setDifficulty(mine.difficulty);
      setRecommendation(mine.recommendation);
      setMode("saved");
    }
  }

  async function save() {
    if (difficulty === null || recommendation === null) return;
    const rating = { difficulty, recommendation };
    const previous = course;
    setSaving(true);
    setFailed(false);
    // Optimistic: the averages move and the box shows the summary at once.
    onChange(withRating(course, rating));
    setMode("saved");
    try {
      await rateCourse(course.id, rating);
    } catch (error) {
      console.error("rating failed", error);
      onChange(previous);
      setMode("open");
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="דירוג הקורס">
      {course.ratings_count === 0 ? (
        <p className={styles.noRatings}>עוד אין דירוגים לקורס הזה.</p>
      ) : (
        <dl className={styles.averages}>
          <Average label="קושי" value={course.avg_difficulty} />
          <Average label="המלצה" value={course.avg_recommendation} />
        </dl>
      )}

      {mode === "collapsed" && (
        <button
          ref={openRef}
          type="button"
          className={styles.collapsed}
          aria-expanded="false"
          onClick={() => setMode("open")}
        >
          <span>דירוג הקורס</span>
          <Chevron direction="down" />
        </button>
      )}

      {mode === "saved" && mine !== null && (
        <div className={styles.saved}>
          <div className={styles.summary}>
            <span className={styles.boxTitle}>הדירוג שלך</span>
            <span className={styles.summaryText}>
              קושי {mine.difficulty} ★ · המלצה {mine.recommendation} ★
            </span>
          </div>
          <button
            ref={editRef}
            type="button"
            className={styles.secondary}
            onClick={() => setMode("open")}
          >
            עריכה
          </button>
        </div>
      )}

      {mode === "open" && (
        <div
          ref={boxRef}
          className={styles.box}
          role="group"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className={styles.boxHeader}>
            <span id={titleId} className={styles.boxTitle}>
              הדירוג שלך
            </span>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="צמצום"
              aria-expanded="true"
              onClick={close}
            >
              <Chevron direction="up" />
            </button>
          </div>
          <StarPicker
            label="קושי"
            hint="1 קל, 5 קשה"
            value={difficulty}
            onPick={(score) => pick(setDifficulty, score)}
          />
          <StarPicker
            label="המלצה"
            hint="1 לא ממליץ, 5 ממליץ מאוד"
            value={recommendation}
            onPick={(score) => pick(setRecommendation, score)}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void save()}
              disabled={!complete || !changed || saving}
            >
              שמירה
            </button>
            <button type="button" className={styles.textButton} onClick={close}>
              {mine === null ? "לא עכשיו" : "ביטול"}
            </button>
          </div>
          {failed && (
            <p className={styles.error} role="alert">
              לא הצלחנו לשמור את הדירוג.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Average({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <div className={styles.average}>
      <dt className={styles.averageLabel}>{label}</dt>
      <dd className={styles.averageValue}>
        <span className={styles.averageNumber}>{value.toFixed(1)}</span>
        <Stars value={value} />
      </dd>
    </div>
  );
}

interface StarPickerProps {
  label: string;
  /** What the scale means, for screen readers. */
  hint: string;
  value: number | null;
  onPick: (score: number) => void;
}

/**
 * Five tappable stars that work as one radio group: Tab reaches the group once, and the
 * arrow keys move between scores, as in any radio list. With a mouse, hovering previews.
 */
function StarPicker({ label, hint, value, onPick }: StarPickerProps) {
  const [hover, setHover] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover ?? value ?? 0;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, score: number) {
    const step = ARROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = Math.max(1, Math.min(5, score + step));
    onPick(next);
    buttons.current[next - 1]?.focus();
  }

  return (
    <div className={styles.picker}>
      <span className={styles.pickerLabel} aria-hidden="true">
        {label}
      </span>
      <div
        className={styles.stars}
        role="radiogroup"
        aria-label={`${label}: ${hint}`}
        onPointerLeave={() => setHover(null)}
      >
        {SCORES.map((score) => (
          <button
            key={score}
            ref={(element) => {
              buttons.current[score - 1] = element;
            }}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${score} מתוך 5`}
            // Only the chosen star (or the first, before a choice) is a Tab stop.
            tabIndex={score === (value ?? 1) ? 0 : -1}
            className={score <= shown ? `${styles.star} ${styles.starOn}` : styles.star}
            onClick={() => onPick(score)}
            onKeyDown={(event) => handleKeyDown(event, score)}
            onPointerEnter={(event) => {
              // A finger has no hover; a tap would leave the preview stuck.
              if (event.pointerType === "mouse") setHover(score);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === "down" ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"} />
    </svg>
  );
}

/**
 * The course as it is after this rating, computed here instead of asking the server again.
 * Re-rating replaces the old rating, so the count stays; a first rating adds one.
 */
function withRating(course: CourseDetails, rating: Rating): CourseDetails {
  const old = course.my_rating;
  const count = course.ratings_count;
  const newCount = old === null ? count + 1 : count;
  const average = (current: number | null, oldScore: number | undefined, newScore: number) =>
    ((current ?? 0) * count - (oldScore ?? 0) + newScore) / newCount;
  return {
    ...course,
    ratings_count: newCount,
    avg_difficulty: average(course.avg_difficulty, old?.difficulty, rating.difficulty),
    avg_recommendation: average(
      course.avg_recommendation,
      old?.recommendation,
      rating.recommendation,
    ),
    my_rating: rating,
  };
}
