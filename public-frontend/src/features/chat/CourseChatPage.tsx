import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";

import {
  GENERAL_COURSE_ID,
  getCourse,
  getSharedMessage,
  type CourseDetails,
  type SharedMessage,
} from "../../shared/api/chat";
import { ApiError } from "../../shared/api/client";
import RatingPanel from "./RatingPanel";
import { ReplyBarProvider } from "./replyBar";
import ReviewCard from "./ReviewCard";
import ReviewList from "./ReviewList";
import ShareButton from "./ShareButton";
import { coursePath, courseUrl, messagePath } from "./share";
import { useViewerGeneration } from "./useViewerGeneration";
import styles from "./CourseChatPage.module.css";

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  // loadedFor: the viewer generation the data was loaded for (see useViewerGeneration).
  | { status: "ready"; course: CourseDetails; loadedFor: number };

// The message of a shared link: still loading, gone (deleted or never existed), or found.
type Shared =
  | { status: "loading" }
  | { status: "missing" }
  | ({ status: "found"; loadedFor: number } & SharedMessage);

interface PageProps {
  /** A fixed course instead of the one in the address: the general chat (/chat/general). */
  courseId?: number;
}

/**
 * A course page: /courses/:courseId, or /courses/:courseId/m/:messageId for a shared message.
 * The general chat is the same page for its own course, at /chat/general.
 */
export default function CourseChatPage(props: PageProps) {
  const params = useParams();
  const courseId = props.courseId ?? Number(params.courseId);
  const messageId = params.messageId === undefined ? null : Number(params.messageId);
  if (!Number.isInteger(courseId) || courseId < 0) {
    return <p className={styles.message}>הקורס לא נמצא.</p>;
  }
  // /courses/0 typed by hand: the general chat lives at its own address.
  if (props.courseId === undefined && courseId === GENERAL_COURSE_ID) {
    return <Navigate to={coursePath(courseId)} replace />;
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
  // A new viewer (sign-in or sign-out here) loads the course (my_rating) and the shared
  // review (liked_by_me) again.
  const generation = useViewerGeneration();

  useEffect(() => {
    const controller = new AbortController();
    getCourse(courseId, controller.signal)
      .then((course) => setState({ status: "ready", course, loadedFor: generation }))
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
  }, [courseId, generation]);

  // Loads together with the course, not after it.
  useEffect(() => {
    if (messageId === null) return;
    const controller = new AbortController();
    getSharedMessage(messageId, controller.signal)
      .then((message) => setShared({ status: "found", ...message, loadedFor: generation }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!(error instanceof ApiError && error.status === 404)) console.error(error);
        setShared({ status: "missing" });
      });
    return () => controller.abort();
  }, [messageId, generation]);

  // A link with the wrong course number still works: move to the right course.
  if (shared?.status === "found" && messageId !== null && shared.course_id !== courseId) {
    return <Navigate to={messagePath(shared.course_id, messageId)} replace />;
  }

  if (state.status === "loading" || shared?.status === "loading") {
    return <p className={styles.message}>טוען…</p>;
  }
  if (state.status === "not-found") return <p className={styles.message}>הקורס לא נמצא.</p>;
  if (state.status === "error") {
    return <p className={styles.message}>לא הצלחנו לטעון את הקורס. אפשר לרענן את הדף ולנסות שוב.</p>;
  }

  const { course } = state;
  const general = course.id === GENERAL_COURSE_ID;
  // One writing bar for the whole page: the shared review above the list answers through it too.
  return (
    <ReplyBarProvider>
      <header className={styles.header}>
        <div className={styles.heading}>
          {!general && <p className={styles.eyebrow}>קורס {course.id}</p>}
          <h1 className={styles.title}>{general ? "צ'אט כללי" : course.name}</h1>
        </div>
        <ShareButton url={courseUrl(course.id)} />
      </header>
      {/* The general chat is not a course, so it has nothing to rate.
          key: once the course reloads for a new viewer, a fresh panel starts from their rating. */}
      {!general && (
        <RatingPanel
          key={state.loadedFor}
          course={course}
          onChange={(next) => setState((s) => (s.status === "ready" ? { ...s, course: next } : s))}
        />
      )}

      {shared?.status === "missing" && (
        <p className={styles.notice}>ההודעה ששותפה כבר לא קיימת. אלה שאר הביקורות בקורס.</p>
      )}
      {shared?.status === "found" && (
        <section className={styles.shared} aria-label="הודעה ששותפה">
          <ReviewCard
            key={shared.loadedFor}
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
    </ReplyBarProvider>
  );
}
