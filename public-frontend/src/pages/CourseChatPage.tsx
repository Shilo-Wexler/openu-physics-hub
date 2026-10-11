import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { getCourse, type CourseDetails } from "../api/chat";
import { ApiError } from "../api/client";
import ReviewList from "../components/chat/ReviewList";

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; course: CourseDetails };

export default function CourseChatPage() {
  const courseId = Number(useParams().courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return <p>הקורס לא נמצא.</p>;
  }
  // key: moving to another course mounts a fresh CourseChat, so no state leaks between courses.
  return <CourseChat key={courseId} courseId={courseId} />;
}

function CourseChat({ courseId }: { courseId: number }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getCourse(courseId, controller.signal)
      .then((course) => setState({ status: "ready", course }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "not-found" });
        } else {
          console.error(error);
          setState({ status: "error" });
        }
      });
    return () => controller.abort();
  }, [courseId]);

  if (state.status === "loading") return <p>טוען...</p>;
  if (state.status === "not-found") return <p>הקורס לא נמצא.</p>;
  if (state.status === "error") return <p>לא הצלחנו לטעון את הקורס. נסו לרענן את הדף.</p>;

  const { course } = state;
  return (
    <>
      <h1>
        {course.name} <small>({course.id})</small>
      </h1>
      <p>
        {course.ratings_count === 0
          ? "עוד אין דירוגים לקורס הזה."
          : `קושי ${course.avg_difficulty?.toFixed(1)} · המלצה ${course.avg_recommendation?.toFixed(1)}`}
      </p>
      {/* The reviews load on their own, so the course header shows as soon as it arrives. */}
      <ReviewList courseId={courseId} />
    </>
  );
}