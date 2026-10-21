import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  PAGE_SIZE,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  loadAnnouncementImage,
  pinAnnouncement,
  publishAnnouncement,
  removeAnnouncementImage,
  unpinAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement,
  uploadAnnouncementImage,
  type AdminAnnouncement,
  type AnnouncementImage,
} from "../../api/announcements";
import { isAbort, isAuthError } from "../../api/client";
import FieldError from "../../components/FieldError";
import { formatDateTime } from "../../lib/format";
import { actionError, useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";

// The server's limits (db/migrations/005_announcements.sql, app/images.py), checked here first so a
// mistake shows next to its field before anything is sent. The server checks everything again.
const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_ALT = 300;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Draft {
  title: string;
  body: string;
  /** A new image to upload on save (adds one, or replaces the current one). */
  file: File | null;
  alt: string;
}

const EMPTY_DRAFT: Draft = { title: "", body: "", file: null, alt: "" };

type Field = "title" | "body" | "file" | "alt";
type FieldErrors = Partial<Record<Field, string>>;

/** What is waiting for the "pin to the home page?" answer: the form, or a draft in the list. */
type Publishing = { from: "form" } | { from: "list"; announcement: AdminAnnouncement };

/** Length the way the server counts it (characters, not UTF-16 units, so an emoji counts once). */
function length(text: string): number {
  return [...text.trim()].length;
}

function check(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  if (length(draft.title) === 0) errors.title = "צריך כותרת.";
  else if (length(draft.title) > MAX_TITLE) errors.title = `הכותרת ארוכה מדי: עד ${MAX_TITLE} תווים.`;
  if (length(draft.body) > MAX_BODY) errors.body = `הטקסט ארוך מדי: עד ${MAX_BODY} תווים.`;
  if (draft.file) {
    if (!IMAGE_TYPES.includes(draft.file.type)) errors.file = "אפשר להעלות רק תמונות JPEG, PNG או WebP.";
    else if (draft.file.size > MAX_IMAGE_BYTES) errors.file = "התמונה גדולה מדי. אפשר עד 10MB.";
    if (length(draft.alt) === 0) errors.alt = "צריך לתאר את התמונה במשפט קצר, בשביל מי שמשתמש בקורא מסך.";
    else if (length(draft.alt) > MAX_ALT) errors.alt = `התיאור ארוך מדי: עד ${MAX_ALT} תווים.`;
  }
  return errors;
}

function statusLabel(announcement: AdminAnnouncement): string {
  if (announcement.pinned) return "נעוצה בדף הבית";
  return announcement.published_at ? "מפורסמת" : "טיוטה";
}

/** A local preview of a chosen file, released when the file changes or the form goes away. */
function usePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

/** An announcement's image in the console. Drafts are not public, so the image is fetched with the token. */
function ConsoleImage({ image, width }: { image: AnnouncementImage; width: number }) {
  const { token } = useAdmin();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    loadAnnouncementImage(token, image, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) console.error(error);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // image.url changes whenever the image does (?v=), so it is the only part that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, image.url]);

  if (!src) return <span className="muted">טוען תמונה...</span>;
  return <img src={src} alt={image.alt} width={width} />;
}

/** Asks whether a publish also pins to the home page. Answers true, false, or null (cancel). */
function PinQuestion({ current, onAnswer }: { current: string | null; onAnswer: (pin: boolean | null) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="card"
      aria-labelledby="pin-question"
      onCancel={(event) => {
        event.preventDefault(); // Esc: close through the answer, so the state stays in step
        onAnswer(null);
      }}
    >
      <h2 id="pin-question">לנעוץ את ההכרזה לדף הבית?</h2>
      <p>
        {current
          ? `דף הבית מציג הכרזה אחת. ההכרזה תחליף את הנעוצה עכשיו: "${current}".`
          : "דף הבית מציג רק את ההכרזה הנעוצה, ועכשיו אין כזו."}
      </p>
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={() => onAnswer(true)}>
          פרסום ונעיצה לדף הבית
        </button>
        <button type="button" className="btn" onClick={() => onAnswer(false)}>
          פרסום בלי נעיצה
        </button>
        <button type="button" className="btn" onClick={() => onAnswer(null)}>
          ביטול
        </button>
      </div>
    </dialog>
  );
}

/**
 * Announcements on the public site. A new one is a draft until it is published; each publish asks
 * whether it also goes on the home page, which shows only the one pinned announcement.
 */
export default function AnnouncementsTab() {
  const { token, version, changed, onAuthError } = useAdmin();
  const [page, setPage] = useState(1);
  const list = useLoad((signal) => listAnnouncements(token, page, signal), [token, version, page]);

  // null: writing a new announcement. Otherwise the one being edited.
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [publishing, setPublishing] = useState<Publishing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A file input cannot be cleared from code; a new key gives a fresh, empty one.
  const [fileInputKey, setFileInputKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const preview = usePreview(draft.file);

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  // Deleting the last announcement of the last page leaves that page empty: go back one.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // The console lists the pinned one first, so it is on the first page whenever there is one.
  const pinned = list.data?.items.find((a) => a.pinned) ?? null;
  const editingPublished = editing !== null && editing.published_at !== null;

  function update(changes: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...changes }));
    setFieldErrors((errors) => {
      const next = { ...errors };
      for (const key of Object.keys(changes)) delete next[key as Field];
      return next;
    });
  }

  function resetForm() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setFileInputKey((k) => k + 1);
  }

  function startEdit(announcement: AdminAnnouncement) {
    setEditing(announcement);
    setDraft({ title: announcement.title, body: announcement.body, file: null, alt: "" });
    setFieldErrors({});
    setError(null);
    setNotice(null);
    setFileInputKey((k) => k + 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Keeps the form in step when a list action changes the announcement being edited. */
  function syncEditing(updated: AdminAnnouncement | null) {
    if (updated && editing?.id === updated.id) setEditing(updated);
  }

  /** Runs one change against the server. Returns its result, or null when it failed (and shows why). */
  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      changed();
      return result;
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** True when the form is ready to send; otherwise shows what to fix. */
  function formIsValid(): boolean {
    const problems = check(draft);
    setFieldErrors(problems);
    return Object.keys(problems).length === 0;
  }

  /** Saves the text, then the image, then publishes when pin is given (true: also to the home page). */
  async function saveForm(pin?: boolean) {
    const input = { title: draft.title.trim(), body: draft.body.trim() };
    const wasPublished = editingPublished;
    const saved = await run(() =>
      editing ? updateAnnouncement(token, editing.id, input) : createAnnouncement(token, input),
    );
    if (!saved) return;

    // From here on the text is saved. If a later step fails, the form stays on this announcement,
    // so only that step needs another try.
    if (draft.file) {
      const file = draft.file;
      const withImage = await run(() => uploadAnnouncementImage(token, saved.id, file, draft.alt.trim()));
      if (!withImage) {
        setEditing(saved);
        setError((message) => `הטקסט נשמר, אבל התמונה לא הועלתה. ${message ?? ""}`.trim());
        return;
      }
    }

    if (pin !== undefined) {
      const done = await run(() => publishAnnouncement(token, saved.id, pin));
      if (!done) {
        setEditing(saved);
        setError((message) => `ההכרזה נשמרה כטיוטה, אבל לא פורסמה. ${message ?? ""}`.trim());
        return;
      }
    }

    resetForm();
    if (pin === true) setNotice("ההכרזה פורסמה ונעוצה לדף הבית.");
    else if (pin === false) setNotice("ההכרזה פורסמה באתר.");
    else if (wasPublished) setNotice("ההכרזה עודכנה באתר.");
    else setNotice("ההכרזה נשמרה כטיוטה. היא לא מופיעה באתר עד שמפרסמים אותה.");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formIsValid()) void saveForm();
  }

  function askToPublishForm() {
    if (formIsValid()) setPublishing({ from: "form" });
  }

  async function answerPin(pin: boolean | null) {
    const pending = publishing;
    setPublishing(null);
    if (pin === null || pending === null) return;
    if (pending.from === "form") {
      await saveForm(pin);
      return;
    }
    const updated = await run(() => publishAnnouncement(token, pending.announcement.id, pin));
    syncEditing(updated);
    if (updated) setNotice(pin ? "ההכרזה פורסמה ונעוצה לדף הבית." : "ההכרזה פורסמה באתר.");
  }

  async function unpublish(announcement: AdminAnnouncement) {
    if (!window.confirm(`להסיר את "${announcement.title}" מהאתר? היא תישאר כאן כטיוטה, ואפשר לפרסם אותה שוב.`)) return;
    syncEditing(await run(() => unpublishAnnouncement(token, announcement.id)));
  }

  async function togglePin(announcement: AdminAnnouncement) {
    syncEditing(
      await run(() =>
        announcement.pinned ? unpinAnnouncement(token, announcement.id) : pinAnnouncement(token, announcement.id),
      ),
    );
  }

  async function removeImage(announcement: AdminAnnouncement) {
    const where = announcement.published_at ? " היא תוסר מהאתר מיד." : "";
    if (!window.confirm(`להסיר את התמונה מההכרזה?${where}`)) return;
    syncEditing(await run(() => removeAnnouncementImage(token, announcement.id)));
  }

  async function remove(announcement: AdminAnnouncement) {
    if (!window.confirm(`למחוק את ההכרזה "${announcement.title}" לצמיתות?`)) return;
    const done = await run(async () => {
      await deleteAnnouncement(token, announcement.id);
      return true;
    });
    if (done && editing?.id === announcement.id) resetForm();
  }

  // The announcement the question is about; the dialog names the pinned one it would replace.
  const askingAbout = publishing?.from === "list" ? publishing.announcement.id : editing?.id;
  const replaces = pinned && pinned.id !== askingAbout ? pinned.title : null;

  return (
    <div className="stats">
      {publishing && (
        <PinQuestion
          current={replaces}
          onAnswer={(pin) => void answerPin(pin)}
        />
      )}

      <form ref={formRef} className="card form" onSubmit={submit} noValidate>
        <h2>{editing ? (editingPublished ? "עריכת הכרזה מפורסמת" : "עריכת טיוטה") : "הכרזה חדשה"}</h2>
        <p className="muted">
          {editingPublished
            ? "השינויים יופיעו באתר מיד עם השמירה."
            : "אפשר לשמור כטיוטה ולפרסם אחר כך. בפרסום תישאל אם לנעוץ את ההכרזה לדף הבית."}
        </p>

        <label>
          כותרת
          <input
            value={draft.title}
            maxLength={MAX_TITLE}
            onChange={(e) => update({ title: e.target.value })}
            aria-invalid={fieldErrors.title !== undefined}
            aria-describedby="announcement-title-error"
          />
          <FieldError id="announcement-title-error" message={fieldErrors.title ?? null} />
        </label>

        <label>
          טקסט (לא חובה)
          <textarea
            value={draft.body}
            rows={6}
            maxLength={MAX_BODY}
            onChange={(e) => update({ body: e.target.value })}
            aria-invalid={fieldErrors.body !== undefined}
            aria-describedby="announcement-body-error"
          />
          <FieldError id="announcement-body-error" message={fieldErrors.body ?? null} />
        </label>

        {editing?.image && !draft.file && (
          <div>
            <p>התמונה הנוכחית:</p>
            <ConsoleImage image={editing.image} width={240} />
            <p className="muted">תיאור: {editing.image.alt}</p>
            <button
              type="button"
              className="btn btn-small btn-danger"
              disabled={busy}
              onClick={() => void removeImage(editing)}
            >
              הסרת התמונה
            </button>
          </div>
        )}

        <label>
          {editing?.image ? "החלפת התמונה (לא חובה)" : "תמונה (לא חובה)"}
          <input
            key={fileInputKey}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            onChange={(e) => update({ file: e.target.files?.[0] ?? null })}
            aria-invalid={fieldErrors.file !== undefined}
            aria-describedby="announcement-file-error"
          />
          <FieldError id="announcement-file-error" message={fieldErrors.file ?? null} />
        </label>

        {draft.file && (
          <>
            {preview && <img src={preview} alt="" width={240} />}
            <label>
              תיאור התמונה (בשביל קוראי מסך, למשל: &quot;לוח הבחינות של סמסטר א&quot;)
              <input
                value={draft.alt}
                maxLength={MAX_ALT}
                onChange={(e) => update({ alt: e.target.value })}
                aria-invalid={fieldErrors.alt !== undefined}
                aria-describedby="announcement-alt-error"
              />
              <FieldError id="announcement-alt-error" message={fieldErrors.alt ?? null} />
            </label>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                update({ file: null, alt: "" });
                setFileInputKey((k) => k + 1);
              }}
            >
              ביטול בחירת התמונה
            </button>
          </>
        )}

        {editingPublished ? (
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "שומר..." : "שמירת השינויים"}
          </button>
        ) : (
          <>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={askToPublishForm}>
              פרסום
            </button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "שומר..." : "שמירה כטיוטה"}
            </button>
          </>
        )}
        {editing && (
          <button type="button" className="btn" disabled={busy} onClick={resetForm}>
            ביטול העריכה
          </button>
        )}
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <section className="card">
        <h2>הכרזות{list.data ? ` (${list.data.total})` : ""}</h2>
        <LoadError loaded={list} what="ההכרזות" />
        {list.data && list.data.items.length === 0 && <p className="muted">עוד אין הכרזות.</p>}
        {list.data && list.data.items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>כותרת</th>
                  <th>מצב</th>
                  <th>תמונה</th>
                  <th>פורסמה</th>
                  <th>על ידי</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.title}
                      {a.edited_at && <span className="muted"> (נערכה)</span>}
                    </td>
                    <td>
                      <span className="badge">{statusLabel(a)}</span>
                    </td>
                    <td>{a.image ? <ConsoleImage image={a.image} width={80} /> : <span className="muted">–</span>}</td>
                    <td className="nowrap">{a.published_at ? formatDateTime(a.published_at) : "–"}</td>
                    <td dir="ltr" className="email-cell">
                      {a.author_email}
                    </td>
                    <td className="row-actions">
                      {a.published_at ? (
                        <>
                          <button className="btn btn-small" disabled={busy} onClick={() => void togglePin(a)}>
                            {a.pinned ? "ביטול נעיצה" : "נעיצה לדף הבית"}
                          </button>
                          <button className="btn btn-small" disabled={busy} onClick={() => void unpublish(a)}>
                            הסרת פרסום
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-small btn-primary"
                          disabled={busy}
                          onClick={() => setPublishing({ from: "list", announcement: a })}
                        >
                          פרסום
                        </button>
                      )}
                      <button className="btn btn-small" disabled={busy} onClick={() => startEdit(a)}>
                        עריכה
                      </button>
                      <button className="btn btn-small btn-danger" disabled={busy} onClick={() => void remove(a)}>
                        מחיקה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="row-actions">
            <button className="btn btn-small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              הקודם
            </button>
            <span className="muted">
              עמוד {page} מתוך {totalPages}
            </span>
            <button className="btn btn-small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              הבא
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
