/** One inquiry on its own screen, as a short form: read it, write a note, pick the status, save once. */

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";

import { isAbort, isAuthError } from "../../shared/api/client";
import {
  getInquiry,
  INQUIRY_STATUSES,
  updateInquiry,
  type InquiryChange,
  type InquiryStatus,
  type InquiryWithContact,
} from "../../shared/api/inquiries";
import BackLink from "../../shared/components/BackLink";
import { Group, Row } from "../../shared/components/GroupedList";
import { useReportUnsaved, useSplit } from "../../shared/components/SplitView";
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

// A number without + is taken as Israeli (0501234567), so its leading 0 becomes this country code.
const LOCAL_COUNTRY_CODE = "972";

/** A WhatsApp chat with the number. WhatsApp wants the full international number, digits only:
    "+972501234567" and "0501234567" both become wa.me/972501234567. */
function whatsappUrl(phone: string): string {
  const digits = phone.startsWith("+") ? phone.slice(1) : phone.replace(/^0/, LOCAL_COUNTRY_CODE);
  return `https://wa.me/${digits}`;
}

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
  const { split } = useSplit();
  const [params] = useSearchParams();
  // The list's filters came along in the address, so back returns to the same list.
  const back = `/inquiries${filtersSearch(readFilters(params))}`;

  const [inquiry, setInquiry] = useState<InquiryWithContact | null>(null);
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
  // On a computer the list is beside this form: a click there asks first too.
  useReportUnsaved(dirty);

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
      changed("inquiries");
      navigate(back, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(errorMessage(e));
      setSaving(false);
    }
  }

  const check = <span className={styles.check}>✓</span>;
  // The server keeps all three null for an anonymous inquiry; otherwise there is a phone or an email.
  const anonymous =
    inquiry !== null && !inquiry.contact_name && !inquiry.contact_phone && !inquiry.contact_email;

  return (
    <>
      {/* Beside the list (computer) there is nothing to go back to. */}
      {!split && <BackLink to={back} label="פניות" confirm={dirty ? LEAVE_QUESTION : undefined} />}

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

          {/* Only what the sender gave. A tap on the phone opens a WhatsApp chat, on the email a new email. */}
          {!anonymous && (
            <Group title="פרטי קשר">
              {inquiry.contact_name && <Row label="שם" value={<bdi>{inquiry.contact_name}</bdi>} />}
              {inquiry.contact_phone && (
                <Row
                  label="טלפון"
                  value={
                    <a
                      className={styles.contactLink}
                      href={whatsappUrl(inquiry.contact_phone)}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                    >
                      {inquiry.contact_phone}
                    </a>
                  }
                />
              )}
              {inquiry.contact_email && (
                <Row
                  label="מייל"
                  value={
                    <a className={styles.contactLink} href={`mailto:${inquiry.contact_email}`} dir="ltr">
                      {inquiry.contact_email}
                    </a>
                  }
                />
              )}
            </Group>
          )}

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
            {anonymous && <Row label="פונה" value="אנונימי" />}
            <Row label="מטפל" value={inquiry.handled_by ? <AdminLabel email={inquiry.handled_by} /> : "עוד לא"} />
            <Row label="עודכנה" value={formatDateTime(inquiry.updated_at)} />
          </Group>
        </>
      )}
    </>
  );
}
