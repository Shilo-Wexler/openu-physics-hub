/** One inquiry on its own screen, as a short form: read it, write a note, pick the status, save once. */

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";

import { isAbort, isAuthError } from "../../shared/api/client";
import {
  getInquiry,
  INQUIRY_STATUSES,
  updateInquiry,
  type Inquiry,
  type InquiryChange,
  type InquiryStatus,
} from "../../shared/api/inquiries";
import BackLink from "../../shared/components/BackLink";
import { Group, Row } from "../../shared/components/GroupedList";
import { formatDateTime } from "../../shared/lib/format";
import { courseLabel, STATUS_LABEL, TYPE_LABEL } from "../../shared/lib/inquiryLabels";
import { errorMessage } from "../../shared/lib/errors";
import { LEAVE_QUESTION, useWarnOnLeave } from "../../shared/lib/unsaved";
import AdminLabel from "../../layout/AdminLabel";
import { useAdmin } from "../../layout/consoleContext";
import { filtersSearch, readFilters } from "./filters";
import styles from "./InquiryDetailPage.module.css";

// Same limit as the server and the inquiries table.
const MAX_NOTE_LENGTH = 2000;

export default function InquiryDetailPage() {
  const { id: idText } = useParams();
  const id = Number(idText);
  // A broken address such as /inquiries/abc goes back to the list.
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/inquiries" replace />;
  // key: opening another inquiry starts from fresh state.
  return <InquiryDetail key={id} id={id} />;
}

function InquiryDetail({ id }: { id: number }) {
  const { token, changed, onAuthError } = useAdmin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // The list's filters came along in the address, so back returns to the same list.
  const back = `/inquiries${filtersSearch(readFilters(params))}`;

  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  // The form: what the admin has picked and written, sent together by "save".
  const [status, setStatus] = useState<InquiryStatus>("new");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getInquiry(token, id, controller.signal)
      .then((loaded) => {
        setInquiry(loaded);
        setStatus(loaded.status);
        setNote(loaded.internal_note ?? "");
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [id, token, onAuthError]);

  const statusChanged = inquiry !== null && status !== inquiry.status;
  const noteChanged = inquiry !== null && note.trim() !== (inquiry.internal_note ?? "");
  const dirty = statusChanged || noteChanged;

  // Closing or reloading the tab with unsaved changes asks too (the browser's own question).
  useWarnOnLeave(dirty);

  /** Sends only what changed, in one request, then goes back to the list (where the inquiry now sits in
      its new view). On a failure the form stays, with the error. */
  async function save() {
    if (!dirty) return;
    const change: InquiryChange = {};
    if (statusChanged) change.status = status;
    if (noteChanged) change.internal_note = note.trim();
    setSaving(true);
    setError(null);
    try {
      await updateInquiry(token, id, change);
      changed();
      navigate(back, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(errorMessage(e));
      setSaving(false);
    }
  }

  const check = <span className={styles.check}>✓</span>;

  return (
    <>
      <BackLink to={back} label="פניות" confirm={dirty ? LEAVE_QUESTION : undefined} />

      {error && <p className="error">{error}</p>}
      {!inquiry && !error && <p className={styles.status}>טוען…</p>}

      {inquiry && (
        <>
          <header className={styles.head}>
            <h1 className={styles.title}>{TYPE_LABEL[inquiry.type]}</h1>
            <p className={styles.meta}>
              <span className={`${styles.tag} ${styles[inquiry.status] ?? ""}`}>{STATUS_LABEL[inquiry.status]}</span>
              <span>
                {courseLabel(inquiry.course_number, inquiry.course_name)} · {formatDateTime(inquiry.created_at)}
              </span>
            </p>
          </header>

          <div className={styles.content} dir="auto">
            {inquiry.content}
          </div>

          <section className={styles.section}>
            <label htmlFor="inquiry-note" className={styles.label}>
              הערה פנימית
            </label>
            <textarea
              id="inquiry-note"
              className={styles.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              rows={3}
              dir="auto"
            />
          </section>

          <Group title="מצב">
            {INQUIRY_STATUSES.map((option) => (
              <Row
                key={option}
                label={STATUS_LABEL[option]}
                value={option === status ? check : undefined}
                onClick={() => setStatus(option)}
                choice
              />
            ))}
          </Group>

          <button type="button" className={styles.save} disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "שומר…" : "שמירה"}
          </button>

          <Group title="פרטים">
            <Row label="מטפל" value={inquiry.handled_by ? <AdminLabel email={inquiry.handled_by} /> : "עוד לא"} />
            <Row label="עודכנה" value={formatDateTime(inquiry.updated_at)} />
          </Group>
        </>
      )}
    </>
  );
}
