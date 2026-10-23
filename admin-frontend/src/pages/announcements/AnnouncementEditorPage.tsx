/** One announcement as a form, new or existing: title, text, image, and where it shows (a draft, the site,
    or the site and its home page). One "save" sends everything that changed, then returns to the list. */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  PAGE_SIZE,
  pinAnnouncement,
  publishAnnouncement,
  removeAnnouncementImage,
  unpinAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement,
  uploadAnnouncementImage,
  type AdminAnnouncement,
} from "../../api/announcements";
import { isAbort, isAuthError } from "../../api/client";
import BackLink from "../../components/BackLink";
import { useConfirm } from "../../components/ConfirmSheet";
import { Group, Row } from "../../components/GroupedList";
import { formatDateTime } from "../../lib/format";
import { actionError, useAdmin } from "../admin/context";
import styles from "./AnnouncementEditorPage.module.css";
import { announcementName } from "./labels";
import TokenImage from "./TokenImage";

// The server's limits (005_announcements.sql, schemas.py, images.py), checked here first so a mistake
// shows before anything is sent. The server checks everything again.
const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_ALT = 300;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SERVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
// A converted photo is scaled down to this on its long side: more than the site ever shows,
// and a phone uploads it much faster than the original.
const MAX_SIDE = 2560;

const LEAVE_QUESTION = "יש שינויים שלא נשמרו. לצאת בלי לשמור?";

type Status = "draft" | "published" | "pinned";

const STATUSES: { value: Status; label: string }[] = [
  { value: "draft", label: "טיוטה" },
  { value: "published", label: "מפורסמת באתר" },
  { value: "pinned", label: "מפורסמת ונעוצה בדף הבית" },
];

function statusOf(announcement: AdminAnnouncement): Status {
  if (announcement.pinned) return "pinned";
  return announcement.published_at ? "published" : "draft";
}

/** Length the way the server counts it: characters, not UTF-16 units, so an emoji counts once. */
function length(text: string): number {
  return [...text.trim()].length;
}

/** Cuts a long name for a note under a group. */
function clip(text: string, max = 60): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join("")}...` : text;
}

/** What the screen needs: the announcement (null for a new one) and the one now on the home page. */
interface Loaded {
  announcement: AdminAnnouncement | null;
  pinned: AdminAnnouncement | null;
}

/** There is no "one announcement" route, so the list's pages are read until it turns up. The pinned one
    is always first on page 1, so a new announcement needs only that page. */
async function load(token: string, id: number | null, signal: AbortSignal): Promise<Loaded | "missing"> {
  let pinned: AdminAnnouncement | null = null;
  for (let page = 1; ; page++) {
    const result = await listAnnouncements(token, page, signal);
    if (page === 1) pinned = result.items.find((a) => a.pinned) ?? null;
    if (id === null) return { announcement: null, pinned };
    const found = result.items.find((a) => a.id === id);
    if (found) return { announcement: found, pinned };
    if (page * PAGE_SIZE >= result.total) return "missing";
  }
}

/** The picture in a file, as the browser reads it; null when it can't. An img element reads every format
    the browser can show, and turns a phone photo the right way up. */
function readImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** A file the server takes. JPEG, PNG and WebP within the size limit go as they are. Anything else the
    browser can show (HEIC from an iPhone, AVIF, GIF, BMP...) or a too large file is drawn on a canvas,
    scaled down and saved as JPEG. Null when the browser cannot read the picture. */
async function toUploadable(file: File): Promise<File | null> {
  if (SERVER_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = await readImage(url);
    if (!image || image.naturalWidth === 0) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG has no transparency: a transparent picture gets a white background instead of a black one.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return null;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "")}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
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

export default function AnnouncementEditorPage() {
  const { id: idText } = useParams();
  // /announcements/new has no id.
  if (idText === undefined) return <AnnouncementEditor key="new" id={null} />;
  const id = Number(idText);
  // A broken address such as /announcements/abc goes back to the list.
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/announcements" replace />;
  // key: opening another announcement starts from fresh state.
  return <AnnouncementEditor key={id} id={id} />;
}

function AnnouncementEditor({ id }: { id: number | null }) {
  const { token, changed, onAuthError } = useAdmin();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  // The form: what the admin has written and picked, sent together by "save".
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  /** A new image to upload on save, in place of the current one if there is one. */
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  /** The current image goes on save. */
  const [dropImage, setDropImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** A picked image is being converted (see toUploadable). */
  const [preparing, setPreparing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = usePreview(file);

  useEffect(() => {
    const controller = new AbortController();
    load(token, id, controller.signal)
      .then((result) => {
        if (result === "missing") {
          setMissing(true);
          return;
        }
        setLoaded(result);
        const a = result.announcement;
        if (a) {
          setTitle(a.title);
          setBody(a.body);
          setStatus(statusOf(a));
        }
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(actionError(e));
      });
    return () => controller.abort();
  }, [id, token, onAuthError]);

  // What the server has now: null until a new announcement is first saved.
  const saved = loaded?.announcement ?? null;
  const savedImage = saved?.image && !dropImage ? saved.image : null;
  const hasImage = file !== null || savedImage !== null;
  const textChanged = title.trim() !== (saved?.title ?? "") || body.trim() !== (saved?.body ?? "");
  const statusChanged = status !== (saved ? statusOf(saved) : "draft");
  const dirty = textChanged || file !== null || dropImage || statusChanged;

  // Closing or reloading the tab with unsaved changes asks too (the browser's own question).
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    // Cleared, so picking the same file again (after removing it) still counts as a change.
    event.target.value = "";
    if (!picked) return;
    // Some files come without a type; the browser then decides whether it can read them.
    if (picked.type && !picked.type.startsWith("image/")) {
      setError("אפשר להעלות רק תמונה.");
      return;
    }
    setError(null);
    setPreparing(true);
    const ready = await toUploadable(picked);
    setPreparing(false);
    if (!ready) {
      setError("הדפדפן הזה לא מצליח לפתוח את התמונה. אפשר לשמור אותה כ-JPEG או PNG ולנסות שוב.");
      return;
    }
    if (ready.size > MAX_IMAGE_BYTES) {
      setError("התמונה גדולה מדי. אפשר עד 10MB.");
      return;
    }
    setFile(ready);
    setDropImage(false);
  }

  function removeImage() {
    setFile(null);
    setAlt("");
    if (saved?.image) setDropImage(true);
  }

  /** What is wrong with the form, or null when it can be sent. */
  function problem(): string | null {
    if (length(title) === 0 && length(body) === 0 && !hasImage) return "צריך לפחות כותרת, טקסט או תמונה.";
    if (length(title) > MAX_TITLE) return `הכותרת ארוכה מדי: עד ${MAX_TITLE} תווים.`;
    if (length(body) > MAX_BODY) return `הטקסט ארוך מדי: עד ${MAX_BODY} תווים.`;
    if (file && length(alt) === 0) return "צריך לתאר את התמונה במשפט קצר, בשביל מי שמשתמש בקורא מסך.";
    if (file && length(alt) > MAX_ALT) return `תיאור התמונה ארוך מדי: עד ${MAX_ALT} תווים.`;
    return null;
  }

  /** Sends what changed, one request at a time, in an order that never leaves a published announcement
      empty (the server refuses that): off the site first, then the new image, the text, removing the old
      image, and on the site last, once it has its content. Then back to the list. */
  async function save() {
    const wrong = problem();
    if (wrong) {
      setError(wrong);
      return;
    }
    setSaving(true);
    setError(null);
    const input = { title: title.trim(), body: body.trim() };
    let current = saved;
    let uploaded = false;
    let dropped = false;
    try {
      if (current === null) current = await createAnnouncement(token, input);
      else if (textChanged && !current.published_at) current = await updateAnnouncement(token, current.id, input);

      if (current.published_at && status === "draft") current = await unpublishAnnouncement(token, current.id);
      if (file) {
        current = await uploadAnnouncementImage(token, current.id, file, alt.trim());
        uploaded = true;
      }
      if (saved !== null && saved.published_at && textChanged) {
        current = await updateAnnouncement(token, current.id, input);
      }
      if (dropImage) {
        current = await removeAnnouncementImage(token, current.id);
        dropped = true;
      }

      if (status !== "draft") {
        if (!current.published_at) current = await publishAnnouncement(token, current.id, status === "pinned");
        else if (status === "pinned" && !current.pinned) current = await pinAnnouncement(token, current.id);
        else if (status === "published" && current.pinned) current = await unpinAnnouncement(token, current.id);
      }

      changed();
      navigate("/announcements", { replace: true });
    } catch (e) {
      // Some steps may have gone through. The form now starts from what the server has, so "save" again
      // sends only what is still missing, and a new announcement is not created twice.
      if (current !== saved) {
        const reached = current;
        setLoaded((l) => ({ announcement: reached, pinned: l?.pinned ?? null }));
        changed();
      }
      if (uploaded) {
        setFile(null);
        setAlt("");
      }
      if (dropped) setDropImage(false);
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      setSaving(false);
    }
  }

  async function remove() {
    if (!saved) return;
    const ok = await confirm({
      message: "ההכרזה תימחק לצמיתות, ואי אפשר יהיה לשחזר אותה.",
      action: "מחיקת ההכרזה",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAnnouncement(token, saved.id);
      changed();
      navigate("/announcements", { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      setSaving(false);
    }
  }

  const back = <BackLink to="/announcements" label="הכרזות" confirm={dirty ? LEAVE_QUESTION : undefined} />;

  if (missing) {
    return (
      <>
        {back}
        <p className={styles.status}>ההכרזה הזו לא נמצאה. אולי היא נמחקה.</p>
      </>
    );
  }
  if (!loaded) {
    return (
      <>
        {back}
        {error ? <p className="error">{error}</p> : <p className={styles.status}>טוען...</p>}
      </>
    );
  }

  // The home page shows one announcement: pinning this one takes the other one's place.
  const replaces = loaded.pinned && loaded.pinned.id !== saved?.id ? loaded.pinned : null;
  const statusNote: Record<Status, string> = {
    draft: "טיוטה לא מופיעה באתר.",
    published: "מופיעה בעמוד ההכרזות באתר.",
    pinned: replaces
      ? `מופיעה גם בדף הבית, במקום "${clip(announcementName(replaces))}".`
      : "מופיעה גם בדף הבית, שמציג הכרזה אחת.",
  };
  const check = <span className={styles.check}>✓</span>;

  return (
    <>
      {back}
      <h1 className={styles.heading}>{saved ? "עריכת הכרזה" : "הכרזה חדשה"}</h1>

      <section className={styles.section}>
        <label htmlFor="announcement-title" className={styles.label}>
          כותרת
        </label>
        <input
          id="announcement-title"
          className={styles.field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          dir="auto"
          placeholder="לא חובה"
        />
      </section>

      <section className={styles.section}>
        <label htmlFor="announcement-body" className={styles.label}>
          טקסט
        </label>
        <textarea
          id="announcement-body"
          className={`${styles.field} ${styles.text}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={5}
          dir="auto"
          placeholder="לא חובה"
        />
      </section>

      {hasImage && (
        <section className={styles.section}>
          <span className={styles.label}>תמונה</span>
          {file && preview && <img className={styles.preview} src={preview} alt="" />}
          {!file && savedImage && <TokenImage image={savedImage} className={styles.preview} />}
        </section>
      )}

      {file && (
        <section className={styles.section}>
          <label htmlFor="announcement-alt" className={styles.label}>
            תיאור התמונה
          </label>
          <input
            id="announcement-alt"
            className={styles.field}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={MAX_ALT}
            dir="auto"
            placeholder="למשל: לוח הבחינות של סמסטר א"
          />
          <p className={styles.hint}>בשביל מי שמשתמש בקורא מסך.</p>
        </section>
      )}

      <Group footer={!file && savedImage ? `תיאור: ${savedImage.alt}` : undefined}>
        {preparing ? (
          <Row label="מכין את התמונה..." />
        ) : (
          <Row label={hasImage ? "החלפת התמונה" : "הוספת תמונה"} onClick={() => fileInput.current?.click()} />
        )}
        {hasImage && !preparing && <Row label="הסרת התמונה" danger onClick={removeImage} />}
      </Group>
      {/* Out of sight; the row above opens it. */}
      <input
        ref={fileInput}
        className={styles.fileInput}
        type="file"
        // Every image: what the server doesn't take is converted (see toUploadable).
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void pickFile(e)}
      />

      <Group title="מצב" footer={statusNote[status]}>
        {STATUSES.map((option) => (
          <Row
            key={option.value}
            label={option.label}
            value={option.value === status ? check : undefined}
            onClick={() => setStatus(option.value)}
          />
        ))}
      </Group>

      {error && <p className="error">{error}</p>}
      <button type="button" className={styles.save} disabled={!dirty || saving || preparing} onClick={save}>
        {saving ? "שומר..." : "שמירה"}
      </button>

      {saved && (
        <>
          <Group title="פרטים">
            <Row label="נכתבה על ידי" value={<bdi dir="ltr">{saved.author_email}</bdi>} />
            <Row label="נוצרה" value={formatDateTime(saved.created_at)} />
            {saved.published_at && <Row label="פורסמה" value={formatDateTime(saved.published_at)} />}
            {saved.edited_at && <Row label="נערכה" value={formatDateTime(saved.edited_at)} />}
          </Group>
          <Group>
            <Row label="מחיקת ההכרזה" danger onClick={() => void remove()} />
          </Group>
        </>
      )}
    </>
  );
}
