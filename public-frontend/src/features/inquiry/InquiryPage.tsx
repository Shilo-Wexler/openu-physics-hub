/**
 * /inquiry: a request or complaint to the student committee. No sign-in needed.
 * Anonymous by default; the sender may choose to leave contact details: a phone or an email
 * (at least one of them), and optionally a name.
 */

import { useEffect, useState, type FormEvent } from "react";

import { GENERAL_COURSE_ID, type Course } from "../../shared/api/chat";
import { ApiError } from "../../shared/api/client";
import {
  CONTACT_EMAIL_ERROR,
  CONTACT_PHONE_ERROR,
  INQUIRY_TYPES,
  MAX_CONTACT_EMAIL_LENGTH,
  MAX_CONTACT_NAME_LENGTH,
  MAX_CONTACT_PHONE_LENGTH,
  MAX_INQUIRY_LENGTH,
  TURNSTILE_ERRORS,
  sendInquiry,
  type InquiryType,
} from "../../shared/api/inquiries";
import SegmentedControl, { type SegmentOption } from "../../shared/components/SegmentedControl";
// Public by design (it is in the page anyway); the matching secret lives only on the server.
import { TURNSTILE_SITE_KEY } from "../../shared/lib/config";
import { loadCourses } from "../courses/courseList";
import CourseSearch from "../courses/CourseSearch";
import TurnstileWidget from "./TurnstileWidget";
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

// Shrunk to one clipped pixel rather than display:none, which some bots check for before filling
// a field. Not moved off screen: in a right-to-left page, an element far to the left widens the
// page, and a phone can then be dragged sideways into the empty space.
const HONEYPOT_STYLE = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} as const;

// What the inquiry is about: the whole program, or one course picked with the search.
type Scope = "general" | "course";

const SCOPES: SegmentOption<Scope>[] = [
  { value: "general", label: "כללית" },
  { value: "course", label: "קורס מסוים" },
];

// Whether the sender leaves a way to reach them.
type Identity = "anonymous" | "contact";

const IDENTITIES: SegmentOption<Identity>[] = [
  { value: "anonymous", label: "אנונימית" },
  { value: "contact", label: "עם פרטים" },
];

// What the backend's 422 "detail" means, for the contact fields.
const CONTACT_ERRORS: Record<string, string> = {
  [CONTACT_PHONE_ERROR]: "מספר הטלפון לא תקין. כדאי לבדוק ולשלוח שוב.",
  [CONTACT_EMAIL_ERROR]: "כתובת המייל לא תקינה. כדאי לבדוק ולשלוח שוב.",
  "missing contact details": "צריך למלא טלפון או מייל.",
};

export default function InquiryPage() {
  // General by default: most inquiries are, and it saves a step.
  const [scope, setScope] = useState<Scope>("general");
  const [course, setCourse] = useState<Course | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [coursesFailed, setCoursesFailed] = useState(false);
  const [type, setType] = useState<InquiryType | "">("");
  const [content, setContent] = useState("");
  // Anonymous by default: leaving details is the sender's choice, never the starting point.
  const [identity, setIdentity] = useState<Identity>("anonymous");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Turnstile: the current token (single use), whether the check could not run, and the widget's
  // key. A new key remounts the widget, which fetches a fresh token.
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);

  // The courses come from the chat backend (the same shared/courses.csv). Loaded only once the
  // reader says the inquiry is about a course, so a general inquiry costs no extra request.
  const needCourses = scope === "course" && courses === null && !coursesFailed;
  useEffect(() => {
    if (!needCourses) return;
    // The request is shared with /courses, so it is not aborted; a page that has left ignores
    // the answer.
    let active = true;
    loadCourses()
      .then((loaded) => {
        if (active) setCourses(loaded);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        console.error(loadError);
        setCoursesFailed(true);
      });
    return () => {
      active = false;
    };
  }, [needCourses]);

  const courseId = scope === "general" ? GENERAL_COURSE_ID : (course?.id ?? null);
  const text = content.trim();
  const anonymous = identity === "anonymous";
  const contact = { name: name.trim(), phone: phone.trim(), email: email.trim() };
  // A way to reply: a phone or an email. A name alone is not enough (the backend checks this too).
  const reachable = contact.phone !== "" || contact.email !== "";
  const filled = courseId !== null && type !== "" && text !== "" && (anonymous || reachable);
  const ready = filled && token !== null && !sending;

  function handleToken(newToken: string | null) {
    setToken(newToken);
    if (newToken) setCheckFailed(false);
  }

  function changeIdentity(next: Identity) {
    setIdentity(next);
    // Back to anonymous: whatever was typed is cleared, so nothing identifying stays in the form.
    if (next === "anonymous") {
      setName("");
      setPhone("");
      setEmail("");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // TypeScript follows the checks inside `ready`: below, courseId is a number, type an
    // InquiryType and token a string.
    if (!ready) return;
    // Only what was filled is sent (undefined is left out of the JSON), and nothing when anonymous.
    const contactFields = anonymous
      ? {}
      : {
          contact_name: contact.name || undefined,
          contact_phone: contact.phone || undefined,
          contact_email: contact.email || undefined,
        };
    setSending(true);
    setError(null);
    try {
      await sendInquiry({
        course_id: courseId,
        type,
        content: text,
        anonymous,
        ...contactFields,
        website,
        turnstile_token: token,
      });
      setSent(true);
    } catch (sendError) {
      setError(errorMessage(sendError));
      // The token was used up by this attempt either way: get a fresh one for the next.
      setToken(null);
      setWidgetKey((key) => key + 1);
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    setScope("general");
    setCourse(null);
    setType("");
    setContent("");
    changeIdentity("anonymous");
    setToken(null);
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
        <p className={styles.lead}>תודה. הפנייה הגיעה לוועד הסטודנטים.</p>
        <button type="button" className={styles.again} onClick={startOver}>
          שליחת פנייה נוספת
        </button>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>פנייה לוועד</p>
        <h1 className={styles.title}>מה תרצו להעביר לוועד הסטודנטים?</h1>
        <p className={styles.lead}>
          אפשר לפנות באופן אנונימי: לא צריך להתחבר, ולא נשמר שום פרט מזהה, אלא אם תבחרו להשאיר פרטי
          קשר.
        </p>
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
                לא הצלחנו לטעון את רשימת הקורסים. אפשר לרענן את הדף, או לשלוח פנייה כללית.
              </p>
            ) : courses === null ? (
              <p className={styles.status}>טוען קורסים…</p>
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

        <div className={styles.field}>
          {/* Seen only, as above. */}
          <span className={styles.fieldTitle} aria-hidden="true">
            פרטי קשר
          </span>
          <SegmentedControl
            options={IDENTITIES}
            value={identity}
            onChange={changeIdentity}
            label="פנייה אנונימית או עם פרטים"
          />

          {!anonymous && (
            <div className={styles.contact}>
              <label className={styles.contactField}>
                <span className={styles.contactLabel}>שם</span>
                <input
                  className={styles.input}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_CONTACT_NAME_LENGTH}
                  autoComplete="name"
                  dir="auto"
                />
              </label>
              <label className={styles.contactField}>
                <span className={styles.contactLabel}>טלפון</span>
                {/* Left to right, so digits and + read in their usual order. */}
                <input
                  className={styles.input}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={MAX_CONTACT_PHONE_LENGTH}
                  autoComplete="tel"
                  inputMode="tel"
                  dir="ltr"
                />
              </label>
              <label className={styles.contactField}>
                <span className={styles.contactLabel}>מייל</span>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={MAX_CONTACT_EMAIL_LENGTH}
                  autoComplete="email"
                  dir="ltr"
                />
              </label>
            </div>
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

        {/* Usually invisible; shows a checkbox only when Cloudflare is unsure. */}
        {TURNSTILE_SITE_KEY && (
          <TurnstileWidget
            key={widgetKey}
            siteKey={TURNSTILE_SITE_KEY}
            onToken={handleToken}
            onFail={() => setCheckFailed(true)}
          />
        )}

        {!TURNSTILE_SITE_KEY ? (
          <p className={styles.error} role="alert">
            טופס הפניות לא זמין כרגע. אפשר לנסות שוב מאוחר יותר.
          </p>
        ) : checkFailed ? (
          <p className={styles.error} role="alert">
            לא הצלחנו לוודא שהשליחה מאדם. אפשר לרענן את הדף ולנסות שוב.
          </p>
        ) : (
          filled &&
          token === null &&
          !sending && <p className={styles.status}>מאמתים את השליחה…</p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={!ready}>
          {sending ? "שולח…" : "שליחה"}
        </button>
      </form>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "נשלחו הרבה פניות בזמן קצר. אפשר לנסות שוב מאוחר יותר.";
    if (error.status === 503) return "השירות לא זמין כרגע. אפשר לנסות שוב בעוד כמה דקות.";
    if (error.status === 422 && TURNSTILE_ERRORS.includes(error.message)) {
      return "האימות נכשל. אפשר לשלוח שוב.";
    }
    const contactError = CONTACT_ERRORS[error.message];
    if (error.status === 422 && contactError) return contactError;
    if (error.status === 422) return "אחד השדות לא תקין. כדאי לבדוק ולשלוח שוב.";
  }
  return "לא הצלחנו לשלוח את הפנייה.";
}
