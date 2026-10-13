/** /inquiry: an anonymous request or complaint to the student committee. No sign-in needed. */

import { useEffect, useState, type FormEvent } from "react";

import { GENERAL_COURSE_ID, listCourses, type Course } from "../../shared/api/chat";
import { ApiError } from "../../shared/api/client";
import SegmentedControl, { type SegmentOption } from "../../shared/components/SegmentedControl";
import CourseSearch from "../courses/CourseSearch";
import { INQUIRY_TYPES, MAX_INQUIRY_LENGTH, sendInquiry, type InquiryType } from "./api";
import styles from "./InquiryPage.module.css";

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

const SCOPES: SegmentOption<Scope>[] = [
  { value: "general", label: "כללית" },
  { value: "course", label: "קורס מסוים" },
];

export default function InquiryPage() {
  // General by default: most inquiries are, and it saves a step.
  const [scope, setScope] = useState<Scope>("general");
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
    setScope("general");
    setCourse(null);
    setType("");
    setContent("");
    setSent(false);
  }

  if (sent) {
    return (
      <section className={styles.done}>
        <span className={styles.check} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 className={styles.title}>הפנייה נשלחה</h1>
        <p className={styles.lead}>תודה. הפנייה הגיעה לוועדת הסטודנטים.</p>
        <button type="button" className={styles.again} onClick={startOver}>
          שליחת פנייה נוספת
        </button>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>פנייה לוועדה</p>
        <h1 className={styles.title}>מה תרצו להעביר לוועדת הסטודנטים?</h1>
        <p className={styles.lead}>הפנייה אנונימית: לא צריך להתחבר, ולא נשמר שום פרט מזהה.</p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          {/* Seen only: the switch below carries the same words as its own label. */}
          <span className={styles.fieldTitle} aria-hidden="true">
            על מה הפנייה?
          </span>
          <SegmentedControl options={SCOPES} value={scope} onChange={setScope} label="על מה הפנייה" />

          {scope === "course" &&
            (course ? (
              <div className={styles.selected}>
                <span className={styles.selectedName}>
                  <span className={styles.selectedNumber}>{course.id}</span> · {course.name}
                </span>
                <button type="button" className={styles.change} onClick={() => setCourse(null)}>
                  שינוי
                </button>
              </div>
            ) : coursesFailed ? (
              <p className={styles.status}>
                רשימת הקורסים לא נטענה. נסו לרענן את הדף, או לשלוח פנייה כללית.
              </p>
            ) : courses === null ? (
              <p className={styles.status}>טוען קורסים...</p>
            ) : (
              <CourseSearch courses={courses} onSelect={setCourse} />
            ))}
        </div>

        {/* Real radio buttons under pill labels: the keyboard, screen readers and `required`
            work as they do for any radio group. */}
        <fieldset className={styles.field}>
          <legend className={styles.fieldTitle}>סוג הפנייה</legend>
          <div className={styles.types}>
            {INQUIRY_TYPES.map((value) => (
              <label key={value} className={styles.type}>
                <input
                  className={styles.typeInput}
                  type="radio"
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  required
                />
                <span className={styles.typeLabel}>{TYPE_LABELS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.field}>
          <label className={styles.fieldTitle} htmlFor="inquiry-content">
            הפנייה
          </label>
          <textarea
            id="inquiry-content"
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={MAX_INQUIRY_LENGTH}
            rows={6}
            dir="auto"
            required
          />
          {content.length >= SHOW_COUNTER_FROM && (
            <span className={styles.counter}>
              {content.length}/{MAX_INQUIRY_LENGTH}
            </span>
          )}
        </div>

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

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={!ready}>
          {sending ? "שולח..." : "שליחה"}
        </button>
      </form>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "נשלחו הרבה פניות בזמן קצר. נסו שוב מאוחר יותר.";
    if (error.status === 422) return "אחד השדות לא תקין. בדקו ונסו שוב.";
  }
  return "השליחה נכשלה, נסו שוב";
}
