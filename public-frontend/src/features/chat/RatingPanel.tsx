/** Course averages, and the signed-in reader's own rating (difficulty + recommendation, 1-5). */

import { useState } from "react";

import { rateCourse, type CourseDetails, type Rating } from "../../shared/api/chat";
import { useAuth } from "../auth/AuthContext";

const SCORES = [1, 2, 3, 4, 5] as const;

interface Props {
  course: CourseDetails;
  /** Replaces the page's copy of the course: new averages and my_rating. */
  onChange: (course: CourseDetails) => void;
}

export default function RatingPanel({ course, onChange }: Props) {
  const { requireSignIn } = useAuth();
  // Starts from the saved rating, so a returning rater sees their scores selected.
  const [difficulty, setDifficulty] = useState(course.my_rating?.difficulty ?? null);
  const [recommendation, setRecommendation] = useState(course.my_rating?.recommendation ?? null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const mine = course.my_rating;
  const complete = difficulty !== null && recommendation !== null;
  const changed = mine === null || difficulty !== mine.difficulty || recommendation !== mine.recommendation;

  function pick(set: (score: number) => void, score: number) {
    if (!requireSignIn()) return;
    setFailed(false);
    set(score);
  }

  async function save() {
    if (difficulty === null || recommendation === null) return;
    const rating = { difficulty, recommendation };
    const previous = course;
    setSaving(true);
    setFailed(false);
    onChange(withRating(course, rating)); // optimistic: the averages move at once
    try {
      await rateCourse(course.id, rating);
    } catch (error) {
      console.error("rating failed", error);
      onChange(previous);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="דירוג הקורס">
      <p>
        {course.ratings_count === 0
          ? "עוד אין דירוגים לקורס הזה."
          : `קושי ${course.avg_difficulty?.toFixed(1)} · המלצה ${course.avg_recommendation?.toFixed(1)}`}
      </p>

      <h2>הדירוג שלי</h2>
      <ScoreRow
        label="קושי"
        low="קל"
        high="קשה"
        value={difficulty}
        onPick={(score) => pick(setDifficulty, score)}
      />
      <ScoreRow
        label="המלצה"
        low="לא ממליץ"
        high="ממליץ מאוד"
        value={recommendation}
        onPick={(score) => pick(setRecommendation, score)}
      />
      <button type="button" onClick={() => void save()} disabled={!complete || !changed || saving}>
        {mine === null ? "שמירת דירוג" : "עדכון דירוג"}
      </button>
      {failed && <p role="alert">שמירת הדירוג נכשלה, נסו שוב</p>}
    </section>
  );
}

interface ScoreRowProps {
  label: string;
  low: string;
  high: string;
  value: number | null;
  onPick: (score: number) => void;
}

function ScoreRow({ label, low, high, value, onPick }: ScoreRowProps) {
  return (
    <div role="group" aria-label={`${label}: 1 ${low}, 5 ${high}`}>
      <span>{label}</span>
      <span>{low}</span>
      {SCORES.map((score) => (
        <button
          key={score}
          type="button"
          aria-pressed={value === score}
          onClick={() => onPick(score)}
        >
          {score}
        </button>
      ))}
      <span>{high}</span>
    </div>
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