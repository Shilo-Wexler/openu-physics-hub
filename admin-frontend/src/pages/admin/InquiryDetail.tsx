/** One inquiry: its full text, its status and who handles it, and the committee's internal note. */

import { useEffect, useState } from "react";

import { isAbort, isAuthError } from "../../api/client";
import {
  getInquiry,
  updateInquiry,
  type Inquiry,
  type InquiryChange,
  type InquiryStatus,
  type InquiryType,
} from "../../api/inquiries";
import { formatDateTime } from "../../lib/format";
import { actionError, useAdmin } from "./context";

// The same wording as the site's form, so the committee sees what the student picked.
export const TYPE_LABEL: Record<InquiryType, string> = {
  exams: "בחינות ומטלות",
  staff: "סגל וחומרי הקורס",
  accessibility: "התאמות ונגישות",
  admin: "מנהלה ותוכנית לימודים",
  other: "אחר",
};

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "חדשה",
  in_progress: "בטיפול",
  closed: "סגורה",
};

// Row colours reuse the console's existing state-* classes (the same ones the old requests list uses).
const STATE_CLASS: Record<InquiryStatus, string> = {
  new: "state-new",
  in_progress: "state-open",
  closed: "state-closed",
};

export function rowClass(status: InquiryStatus): string {
  return STATE_CLASS[status];
}

/** "20201 · מכניקה"; the general row (number 0) shows its name only. */
export function courseLabel(courseNumber: number | null, name: string): string {
  return courseNumber === null || courseNumber === 0 ? name : `${courseNumber} · ${name}`;
}

// The status buttons each status offers, the main next step first.
const NEXT: Record<InquiryStatus, { to: InquiryStatus; label: string; primary?: boolean }[]> = {
  new: [
    { to: "in_progress", label: "לקחת לטיפול", primary: true },
    { to: "closed", label: "סגירה" },
  ],
  in_progress: [
    { to: "closed", label: "סגירה", primary: true },
    { to: "new", label: "החזרה לחדשות" },
  ],
  closed: [{ to: "in_progress", label: "פתיחה מחדש" }],
};

// Same limit as the server and the inquiries table.
const MAX_NOTE_LENGTH = 2000;

interface Props {
  id: number;
  onClose: () => void;
}

export default function InquiryDetail({ id, onClose }: Props) {
  const { token, changed, onAuthError } = useAdmin();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getInquiry(token, id, controller.signal)
      .then((loaded) => {
        setInquiry(loaded);
        setNote(loaded.internal_note ?? "");
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(actionError(e));
      });
    return () => controller.abort();
  }, [id, token, onAuthError]);

  const noteChanged = inquiry !== null && note.trim() !== (inquiry.internal_note ?? "");

  /** Sends the change; returns the inquiry as the server now has it, or null when it failed. */
  async function save(change: InquiryChange): Promise<Inquiry | null> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateInquiry(token, id, change);
      setInquiry(updated);
      if (change.internal_note !== undefined) setNote(updated.internal_note ?? "");
      changed();
      return updated;
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** A status button: saves the note with it when it changed, then closes the panel (the list shows the new
      status). On a failure the panel stays open with the error. */
  async function moveTo(status: InquiryStatus) {
    const updated = await save(noteChanged ? { status, internal_note: note.trim() } : { status });
    if (updated) onClose();
  }

  /** A note written without a status change is saved when the box is left. */
  async function saveNoteOnLeave() {
    if (!noteChanged || busy) return;
    if (await save({ internal_note: note.trim() })) setNotice("ההערה נשמרה.");
  }

  return (
    <aside className="card detail">
      <div className="detail-head">
        <h2>פנייה #{id}</h2>
        <button className="link-button" onClick={onClose} aria-label="סגירת החלון">
          ✕
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {!inquiry && !error && <p className="muted">טוען...</p>}

      {inquiry && (
        <>
          <dl className="meta">
            <dt>מצב</dt>
            <dd>
              <span className="badge">{STATUS_LABEL[inquiry.status]}</span>
            </dd>
            <dt>קורס</dt>
            <dd>{courseLabel(inquiry.course_number, inquiry.course_name)}</dd>
            <dt>סוג</dt>
            <dd>{TYPE_LABEL[inquiry.type]}</dd>
            <dt>נשלחה</dt>
            <dd>{formatDateTime(inquiry.created_at)}</dd>
            <dt>מטפל</dt>
            <dd>{inquiry.handled_by ? <bdi dir="ltr">{inquiry.handled_by}</bdi> : "עוד לא"}</dd>
            <dt>עודכנה</dt>
            <dd>{formatDateTime(inquiry.updated_at)}</dd>
          </dl>

          <div className="body-text" dir="auto">
            {inquiry.content}
          </div>

          <div className="field">
            <label htmlFor={`inquiry-note-${id}`}>הערה פנימית (רק חברי הוועדה רואים אותה)</label>
            <textarea
              id={`inquiry-note-${id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNoteOnLeave}
              maxLength={MAX_NOTE_LENGTH}
              rows={4}
              dir="auto"
            />
          </div>

          <div className="actions">
            {NEXT[inquiry.status].map((step) => (
              <button
                key={step.to}
                className={step.primary ? "btn btn-primary" : "btn"}
                disabled={busy}
                // Keeps the focus in the note box, so leaving it does not save the note on its own
                // (and disable this button) before the click: the click saves the note and the status together.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => moveTo(step.to)}
              >
                {step.label}
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}