/** One meeting summary as a form, new or existing: title, meeting date, text and attached files. The same
    screen is for reading and for editing, like an announcement. "Save" sends it and returns to the list. */

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { ApiError, isAbort, isAuthError } from "../../shared/api/client";
import {
  createMeeting,
  deleteAttachment,
  deleteMeeting,
  getMeeting,
  updateMeeting,
  uploadAttachment,
  type Meeting,
} from "../../shared/api/meetings";
import BackLink from "../../shared/components/BackLink";
import { useConfirm } from "../../shared/components/ConfirmSheet";
import { Group, Row } from "../../shared/components/GroupedList";
import { formatDateTime } from "../../shared/lib/format";
import { errorMessage } from "../../shared/lib/errors";
import { charLength } from "../../shared/lib/text";
import { LEAVE_QUESTION, useWarnOnLeave } from "../../shared/lib/unsaved";
import { useAdmin } from "../../layout/consoleContext";
import MeetingFiles, { toPending, type PendingFile } from "./MeetingFiles";
import styles from "./MeetingEditorPage.module.css";
import { todayMeetingDate } from "./meetingDate";

// The server's limits (007_meetings.sql, schemas.py), checked here first so a mistake shows before
// anything is sent. The server checks everything again.
const MAX_TITLE = 120;
const MAX_CONTENT = 20000;

const LIST = "/more/meetings";

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
  const { token, isTeam, changed, onAuthError } = useAdmin();
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
  // Files picked but not uploaded yet, and saved files to delete: both wait for "save" too.
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
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
        else setError(errorMessage(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [id, token, onAuthError]);

  // A new summary counts as changed once something is typed; the date alone is just the default.
  const fieldsDirty = saved
    ? title.trim() !== saved.title || meetingDate !== saved.meeting_date || content.trim() !== saved.content
    : charLength(title) > 0 || charLength(content) > 0;
  const dirty = fieldsDirty || pending.length > 0 || removed.size > 0;

  // Closing or reloading the tab with unsaved changes asks too (the browser's own question).
  useWarnOnLeave(dirty);

  /** What is wrong with the form, or null when it can be sent. */
  function problem(): string | null {
    if (charLength(title) > MAX_TITLE) return `הכותרת ארוכה מדי: עד ${MAX_TITLE} תווים.`;
    if (!meetingDate) return "צריך את תאריך הישיבה.";
    // Text and files are each optional, but not both: an empty summary says nothing.
    // Only the console checks this: the server creates the summary before its files are uploaded.
    const files = pending.length + (saved?.attachments.filter((a) => !removed.has(a.id)).length ?? 0);
    if (charLength(content) === 0 && files === 0) return "צריך לכתוב סיכום או לצרף קובץ.";
    if (charLength(content) > MAX_CONTENT) return `הסיכום ארוך מדי: עד ${MAX_CONTENT} תווים.`;
    return null;
  }

  /** The summary first (a new one needs its id for its files), then the removals, then the uploads,
      one at a time. If one step fails, what already succeeded stays saved and leaves the form state,
      so pressing "save" again continues from there instead of creating the summary twice. */
  async function save() {
    const wrong = problem();
    if (wrong) {
      setError(wrong);
      return;
    }
    setSaving(true);
    setError(null);
    const input = { title: title.trim(), meeting_date: meetingDate, content: content.trim() };
    let meeting = saved;
    try {
      if (!meeting) meeting = await createMeeting(token, input);
      else if (fieldsDirty) meeting = await updateMeeting(token, meeting.id, input);
      setSaved(meeting);
      changed();
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(errorMessage(e));
      setSaving(false);
      return;
    }

    const meetingId = meeting.id;
    let current: PendingFile | null = null;
    try {
      for (const attachmentId of removed) {
        await deleteAttachment(token, meetingId, attachmentId);
        setRemoved((marks) => new Set([...marks].filter((mark) => mark !== attachmentId)));
        setSaved((m) => m && { ...m, attachments: m.attachments.filter((a) => a.id !== attachmentId) });
      }
      for (const item of pending) {
        current = item;
        const attachment = await uploadAttachment(token, meetingId, item.file);
        setPending((files) => files.filter((file) => file.key !== item.key));
        setSaved((m) => m && { ...m, attachments: [...m.attachments, attachment] });
      }
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else if (current) {
        setError(`הסיכום נשמר, אבל לא הצלחנו להעלות את "${current.file.name}". אפשר ללחוץ שוב על "שמירה".`);
      } else {
        setError(`הסיכום נשמר, אבל לא הצלחנו למחוק את כל הקבצים. אפשר ללחוץ שוב על "שמירה".`);
      }
      setSaving(false);
      return;
    }
    navigate(LIST, { replace: true });
  }

  async function remove() {
    if (!saved) return;
    const ok = await confirm({
      message: "הסיכום והקבצים שלו יימחקו לצמיתות, ואי אפשר יהיה לשחזר אותם.",
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
      else setError(errorMessage(e));
      setSaving(false);
    }
  }

  function toggleRemoved(attachmentId: number) {
    setRemoved((marks) => {
      const next = new Set(marks);
      if (next.has(attachmentId)) next.delete(attachmentId);
      else next.add(attachmentId);
      return next;
    });
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
        {error ? <p className="error">{error}</p> : <p className={styles.status}>טוען…</p>}
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
          סיכום (לא חובה כשיש קובץ)
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

      <MeetingFiles
        meetingId={saved?.id ?? null}
        saved={saved?.attachments ?? []}
        pending={pending}
        removed={removed}
        canRemoveSaved={!isTeam}
        disabled={saving}
        onAdd={(files) => {
          setError(null);
          setPending((current) => [...current, ...toPending(files)]);
        }}
        onRemovePending={(key) => setPending((current) => current.filter((file) => file.key !== key))}
        onToggleRemoved={toggleRemoved}
        onError={setError}
      />

      {error && <p className="error">{error}</p>}
      <button type="button" className={styles.save} disabled={!dirty || saving} onClick={() => void save()}>
        {saving ? "שומר…" : "שמירה"}
      </button>

      {saved && (
        <>
          <Group title="פרטים">
            <Row label="נכתב על ידי" value={<bdi>{saved.created_by_name}</bdi>} />
            <Row label="נוצר" value={formatDateTime(saved.created_at)} />
            {edited && <Row label="נערך לאחרונה על ידי" value={<bdi>{saved.updated_by_name}</bdi>} />}
            {edited && <Row label="נערך" value={formatDateTime(saved.updated_at)} />}
          </Group>
          {/* Team cannot delete (the server refuses too), so the row is not shown. */}
          {!isTeam && (
            <Group>
              <Row label="מחיקת הסיכום" danger onClick={() => void remove()} />
            </Group>
          )}
        </>
      )}
    </>
  );
}
