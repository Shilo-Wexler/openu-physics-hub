import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { getCourse, listMessages, type CourseDetails, type Message } from "../api/chat";
import { ApiError } from "../api/client";
import MessageList from "../components/chat/MessageList";

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; course: CourseDetails; messages: Message[]; nextBefore: number | null };

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
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // Both requests run at the same time; the page waits for the slower one only.
    Promise.all([
      getCourse(courseId, controller.signal),
      listMessages(courseId, undefined, controller.signal),
    ])
      .then(([course, page]) =>
        setState({ status: "ready", course, messages: page.messages, nextBefore: page.next_before }),
      )
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

  async function loadMore() {
    if (state.status !== "ready" || state.nextBefore === null) return;
    setLoadingMore(true);
    try {
      const page = await listMessages(courseId, state.nextBefore);
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              messages: [...current.messages, ...page.messages],
              nextBefore: page.next_before,
            }
          : current,
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  }

  if (state.status === "loading") return <p>טוען...</p>;
  if (state.status === "not-found") return <p>הקורס לא נמצא.</p>;
  if (state.status === "error") return <p>לא הצלחנו לטעון את הצ'אט. נסו לרענן את הדף.</p>;

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
      <MessageList
        messages={state.messages}
        hasMore={state.nextBefore !== null}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
      />
    </>
  );
}