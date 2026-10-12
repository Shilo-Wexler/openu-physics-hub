import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";

import {
  getCourse,
  getSharedMessage,
  type CourseDetails,
  type SharedMessage,
} from "../../shared/api/chat";
import { ApiError } from "../../shared/api/client";
import ReviewCard from "./ReviewCard";
import ReviewList from "./ReviewList";
import ShareButton from "./ShareButton";
import { courseUrl } from "./share";
import styles from "./CourseChatPage.module.css";

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; course: CourseDetails };

// The message of a shared link: still loading, gone (deleted or never existed), or found.
type Shared = { status: "loading" } | { status: "missing" } | ({ status: "found" } & SharedMessage);

/** A course page: /courses/:courseId, or /courses/:courseId/m/:messageId for a shared message. */
export default function CourseChatPage() {
  const params = useParams();
  const courseId = Number(params.courseId);
  const messageId = params.messageId === undefined ? null : Number(params.messageId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return <p>הקורס לא נמצא.</p>;
  }
  // key: moving to another course or link mounts a fresh CourseChat, so no state leaks.
  return (
    <CourseChat
      key={`${courseId}/${messageId}`}
      courseId={courseId}
      messageId={Number.isInteger(messageId) ? messageId : null}
    />
  );
}

function CourseChat({ courseId, messageId }: { courseId: number; messageId: number | null }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [shared, setShared] = useState<Shared | null>(
    messageId === null ? null : { status: "loading" },
  );

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

  // Loads together with the course, not after it.
  useEffect(() => {
    if (messageId === null) return;
    const controller = new AbortController();
    getSharedMessage(messageId, controller.signal)
      .then((message) => setShared({ status: "found", ...message }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!(error instanceof ApiError && error.status === 404)) console.error(error);
        setShared({ status: "missing" });
      });
    return () => controller.abort();
  }, [messageId]);

  // A link with the wrong course number still works: move to the right course.
  if (shared?.status === "found" && shared.course_id !== courseId) {
    return <Navigate to={`/courses/${shared.course_id}/m/${messageId}`} replace />;
  }

  if (state.status === "loading" || shared?.status === "loading") return <p>טוען...</p>;
  if (state.status === "not-found") return <p>הקורס לא נמצא.</p>;
  if (state.status === "error") return <p>לא הצלחנו לטעון את הקורס. נסו לרענן את הדף.</p>;

  const { course } = state;
  return (
    <>
      <div className={styles.header}>
        <h1>
          {course.name} <small>({course.id})</small>
        </h1>
        <ShareButton url={courseUrl(course.id)} />
      </div>
      <p>
        {course.ratings_count === 0
          ? "עוד אין דירוגים לקורס הזה."
          : `קושי ${course.avg_difficulty?.toFixed(1)} · המלצה ${course.avg_recommendation?.toFixed(1)}`}
      </p>

      {shared?.status === "missing" && (
        <p className={styles.notice}>ההודעה ששותפה כבר לא קיימת. אלה שאר הביקורות בקורס.</p>
      )}
      {shared?.status === "found" && (
        <section className={styles.shared} aria-label="הודעה ששותפה">
          <ReviewCard
            review={shared.review}
            courseId={courseId}
            highlighted={shared.reply_id === null}
            highlightReplyId={shared.reply_id}
          />
        </section>
      )}

      {/* The reviews load on their own, so the course header shows as soon as it arrives. */}
      <ReviewList
        courseId={courseId}
        hiddenId={shared?.status === "found" ? shared.review.id : null}
      />
    </>
  );
}
