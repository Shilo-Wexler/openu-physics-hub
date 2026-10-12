/** /inquiry: an anonymous request or complaint to the student committee. No sign-in needed. */

import { useEffect, useState, type FormEvent } from "react";

import { GENERAL_COURSE_ID, listCourses, type Course } from "../../shared/api/chat";
import { ApiError } from "../../shared/api/client";
import CourseSearch from "../courses/CourseSearch";
import { INQUIRY_TYPES, MAX_INQUIRY_LENGTH, sendInquiry, type InquiryType } from "./api";

const TYPE_LABELS: Record<InquiryType, string> = {
  exams: "בחינות ומטלות",
  staff: "סגל וחומרי הקורס",
  accessibility: "התאמות ונגישות",
  admin: "מנהלה ותוכנית לימודים",
  other: "אחר",
};

// The counter appears only near the limit, as in the chat's writing box.
const SHOW_COUNTER_FROM = MAX_INQUIRY_LENGTH - 300;

// Moved off screen rather than display:none, which some bots check for before filling a field.
const HONEYPOT_STYLE = { position: "absolute", left: "-10000px", width: 1, height: 1 } as const;

// What the inquiry is about: the whole program, or one course picked with the search.
type Scope = "general" | "course";

export default function InquiryPage() {
  const [scope, setScope] = useState<Scope | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [coursesFailed, setCoursesFailed] = useState(false);
  const [type, setType] = useState<InquiryType | "">("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The courses come from the chat backend (the same shared/courses.csv). Loaded only once the
  // reader says the inquiry is about a course, so a general inquiry costs no extra request.
  const needCourses = scope === "course" && courses === null && !coursesFailed;
  useEffect(() => {
    if (!needCourses) return;
    const controller = new AbortController();
    listCourses(controller.signal)
      .then(setCourses)
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        console.error(loadError);
        setCoursesFailed(true);
      });
    return () => controller.abort();
  }, [needCourses]);

  const courseId = scope === "general" ? GENERAL_COURSE_ID : (course?.id ?? null);
  const text = content.trim();
  const ready = courseId !== null && type !== "" && text !== "" && !sending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // TypeScript follows the checks inside `ready`: below, courseId is a number and type an
    // InquiryType.
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      await sendInquiry({
        course_id: courseId,
        type,
        content: text,
        website,
        turnstile_token: null,
      });
      setSent(true);
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    setScope(null);
    setCourse(null);
    setType("");
    setContent("");
    setSent(false);
  }

  if (sent) {
    return (
      <>
        <h1>הפנייה נשלחה</h1>
        <p>תודה. הפנייה הגיעה לוועדת הסטודנטים.</p>
        <button type="button" onClick={startOver}>
          שליחת פנייה נוספת
        </button>
      </>
    );
  }

  return (
    <>
      <h1>פנייה לוועדת הסטודנטים</h1>
      <p>הפנייה אנונימית: לא צריך להתחבר, ולא נשמר שום פרט מזהה.</p>

      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>על מה הפנייה?</legend>
          <label>
            <input
              type="radio"
              name="scope"
              checked={scope === "general"}
              onChange={() => setScope("general")}
              required
            />{" "}
            פנייה כללית
          </label>{" "}
          <label>
            <input
              type="radio"
              name="scope"
              checked={scope === "course"}
              onChange={() => setScope("course")}
            />{" "}
            קורס מסוים
          </label>
        </fieldset>

        {scope === "course" &&
          (course ? (
            <p>
              הקורס: {course.id} · {course.name}{" "}
              <button type="button" onClick={() => setCourse(null)}>
                שינוי
              </button>
            </p>
          ) : coursesFailed ? (
            <p>רשימת הקורסים לא נטענה. נסו לרענן את הדף, או לשלוח פנייה כללית.</p>
          ) : courses === null ? (
            <p>טוען קורסים...</p>
          ) : (
            <CourseSearch courses={courses} onSelect={setCourse} />
          ))}

        <p>
          <label>
            סוג הפנייה{" "}
            <select
              value={type}
              onChange={(e) => setType(e.target.value as InquiryType)}
              required
            >
              <option value="" disabled>
                בחרו סוג
              </option>
              {INQUIRY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </p>

        <p>
          <label>
            הפנייה
            <br />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_INQUIRY_LENGTH}
              rows={6}
              dir="auto"
              required
            />
          </label>
          {content.length >= SHOW_COUNTER_FROM && (
            <small>
              {content.length}/{MAX_INQUIRY_LENGTH}
            </small>
          )}
        </p>

        {/* Honeypot: hidden from people and screen readers; a bot that fills it is dropped. */}
        <div style={HONEYPOT_STYLE} aria-hidden="true">
          <label>
            Website
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>
        </div>

        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={!ready}>
          {sending ? "שולח..." : "שליחה"}
        </button>
      </form>
    </>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "נשלחו הרבה פניות בזמן קצר. נסו שוב מאוחר יותר.";
    if (error.status === 422) return "אחד השדות לא תקין. בדקו ונסו שוב.";
  }
  return "השליחה נכשלה, נסו שוב";
}
