/** One meeting summary as a form, new or existing: title, meeting date and text. The same screen is
    for reading and for editing, like an announcement. "Save" sends it and returns to the list. */

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { ApiError, isAbort, isAuthError } from "../../api/client";
import { createMeeting, deleteMeeting, getMeeting, updateMeeting, type Meeting } from "../../api/meetings";
import BackLink from "../../components/BackLink";
import { useConfirm } from "../../components/ConfirmSheet";
import { Group, Row } from "../../components/GroupedList";
import { formatDateTime } from "../../lib/format";
import { actionError, useAdmin } from "../admin/context";
import styles from "./MeetingEditorPage.module.css";
import { todayMeetingDate } from "./meetingDate";

// The server's limits (007_meetings.sql, schemas.py), checked here first so a mistake shows before
// anything is sent. The server checks everything again.
const MAX_TITLE = 120;
const MAX_CONTENT = 20000;

const LIST = "/more/meetings";
const LEAVE_QUESTION = "יש שינויים שלא נשמרו. לצאת בלי לשמור?";

/** Length the way the server counts it: characters, not UTF-16 units, so an emoji counts once. */
function length(text: string): number {
  return [...text.trim()].length;
}

/** An empty field is right-to-left, so the cursor starts on the right like the rest of the page.
    (dir="auto" alone makes an empty field left-to-right.) Typed text then picks its own direction. */
function fieldDir(value: string): "auto" | "rtl" {
  return value ? "auto" : "rtl";
}

/** Opens the browser's calendar from a click anywhere on the date, not only on its small native button.
    Older browsers without showPicker still open it their own way. */
function openPicker(input: HTMLInputElement) {
  try {
    input.showPicker();
  } catch {
    // Not allowed here (or not supported): the browser's own behaviour stays.
  }
}

export default function MeetingEditorPage() {
  const { id: idText } = useParams();
  // /more/meetings/new has no id.
  if (idText === undefined) return <MeetingEditor key="new" id={null} />;
  const id = Number(idText);
  // A broken address such as /more/meetings/abc goes back to the list.
  if (!Number.isInteger(id) || id <= 0) return <Navigate to={LIST} replace />;
  // key: opening another summary starts from fresh state.
  return <MeetingEditor key={id} id={id} />;
}

function MeetingEditor({ id }: { id: number | null }) {
  const { token, isMember, changed, onAuthError } = useAdmin();
  const confirm = useConfirm();
  const navigate = useNavigate();

  /** What the server has now: null for a new summary. */
  const [saved, setSaved] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(id !== null);
  const [missing, setMissing] = useState(false);
  // The form, sent together by "save".
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(todayMeetingDate);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === null) return;
    const controller = new AbortController();
    getMeeting(token, id, controller.signal)
      .then((meeting) => {
        setSaved(meeting);
        setTitle(meeting.title);
        setMeetingDate(meeting.meeting_date);
        setContent(meeting.content);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError(actionError(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [id, token, onAuthError]);

  // A new summary counts as changed once something is typed; the date alone is just the default.
  const dirty = saved
    ? title.trim() !== saved.title || meetingDate !== saved.meeting_date || content.trim() !== saved.content
    : length(title) > 0 || length(content) > 0;

  // Closing or reloading the tab with unsaved changes asks too (the browser's own question).
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /** What is wrong with the form, or null when it can be sent. */
  function problem(): string | null {
    if (length(title) > MAX_TITLE) return `הכותרת ארוכה מדי: עד ${MAX_TITLE} תווים.`;
    if (!meetingDate) return "צריך את תאריך הישיבה.";
    if (length(content) === 0) return "צריך לכתוב את הסיכום.";
    if (length(content) > MAX_CONTENT) return `הסיכום ארוך מדי: עד ${MAX_CONTENT} תווים.`;
    return null;
  }

  async function save() {
    const wrong = problem();
    if (wrong) {
      setError(wrong);
      return;
    }
    setSaving(true);
    setError(null);
    const input = { title: title.trim(), meeting_date: meetingDate, content: content.trim() };
    try {
      if (saved) await updateMeeting(token, saved.id, input);
      else await createMeeting(token, input);
      changed();
      navigate(LIST, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      setSaving(false);
    }
  }

  async function remove() {
    if (!saved) return;
    const ok = await confirm({
      message: "הסיכום יימחק לצמיתות, ואי אפשר יהיה לשחזר אותו.",
      action: "מחיקת הסיכום",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await deleteMeeting(token, saved.id);
      changed();
      navigate(LIST, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      setSaving(false);
    }
  }

  const back = <BackLink to={LIST} label="סיכומי ישיבות" confirm={dirty ? LEAVE_QUESTION : undefined} />;

  if (missing) {
    return (
      <>
        {back}
        <p className={styles.status}>הסיכום הזה לא נמצא. אולי הוא נמחק.</p>
      </>
    );
  }
  if (loading || (id !== null && !saved)) {
    return (
      <>
        {back}
        {error ? <p className="error">{error}</p> : <p className={styles.status}>טוען...</p>}
      </>
    );
  }

  // Saving with no change is not an edit, so the times differ only after a real one.
  const edited = saved !== null && saved.updated_at !== saved.created_at;

  return (
    <>
      {back}
      <h1 className={styles.heading}>{saved ? "סיכום ישיבה" : "סיכום חדש"}</h1>

      <section className={styles.section}>
        <label htmlFor="meeting-title" className={styles.label}>
          כותרת (לא חובה)
        </label>
        <input
          id="meeting-title"
          className={styles.field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          dir={fieldDir(title)}
        />
      </section>

      <section className={styles.section}>
        <label htmlFor="meeting-date" className={styles.label}>
          תאריך הישיבה
        </label>
        {/* A box with the date in blue and a calendar icon, so it reads as something to tap and change. */}
        <span className={styles.dateBox}>
          <input
            id="meeting-date"
            className={`${styles.field} ${styles.date}`}
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            onClick={(e) => openPicker(e.currentTarget)}
          />
          <svg className={styles.dateIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 2v4M16 2v4M3 10h18" />
            <rect x="3" y="4" width="18" height="18" rx="2" />
          </svg>
        </span>
      </section>

      <section className={styles.section}>
        <label htmlFor="meeting-content" className={styles.label}>
          סיכום
        </label>
        <textarea
          id="meeting-content"
          className={`${styles.field} ${styles.text}`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={MAX_CONTENT}
          rows={10}
          dir={fieldDir(content)}
        />
      </section>

      {error && <p className="error">{error}</p>}
      <button type="button" className={styles.save} disabled={!dirty || saving} onClick={() => void save()}>
        {saving ? "שומר..." : "שמירה"}
      </button>

      {saved && (
        <>
          <Group title="פרטים">
            <Row label="נכתב על ידי" value={<bdi>{saved.created_by_name}</bdi>} />
            <Row label="נוצר" value={formatDateTime(saved.created_at)} />
            {edited && <Row label="נערך לאחרונה על ידי" value={<bdi>{saved.updated_by_name}</bdi>} />}
            {edited && <Row label="נערך" value={formatDateTime(saved.updated_at)} />}
          </Group>
          {/* A committee member cannot delete (the server refuses too), so the row is not shown. */}
          {!isMember && (
            <Group>
              <Row label="מחיקת הסיכום" danger onClick={() => void remove()} />
            </Group>
          )}
        </>
      )}
    </>
  );
}
