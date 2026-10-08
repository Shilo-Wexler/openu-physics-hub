import { useEffect, useState } from "react";

import { listCourses, type Course } from "../api/chat";
import CourseSearch from "../components/CourseSearch";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; courses: Course[] };

export default function CoursesPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // Cancels the request if the visitor leaves the page before it answers.
    const controller = new AbortController();
    listCourses(controller.signal)
      .then((courses) => setState({ status: "ready", courses }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error);
          setState({ status: "error" });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <h1>צ'אט הקורסים</h1>
      {state.status === "loading" && <p>טוען קורסים...</p>}
      {state.status === "error" && <p>לא הצלחנו לטעון את הקורסים. נסו לרענן את הדף.</p>}
      {state.status === "ready" && <CourseSearch courses={state.courses} />}
    </>
  );
}