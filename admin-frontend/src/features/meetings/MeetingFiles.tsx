/** The "attached files" part of the meeting form. Nothing here talks to the server except a download:
    files picked or marked for removal wait in the editor's state until "save" sends them.
    Each file shows as a small sheet with its type on a coloured label, like a computer's file manager. */

import { useRef, useState, type ChangeEvent } from "react";

import { isAuthError } from "../../shared/api/client";
import { downloadAttachment, type MeetingAttachment } from "../../shared/api/meetings";
import { useAdmin } from "../../layout/consoleContext";
import styles from "./MeetingFiles.module.css";

// The server's limit (MAX_ATTACHMENT_BYTES in routes/meetings.py), checked here first so a file that is
// too big is refused when it is picked, not after the summary was saved. The server checks again.
const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
// The browser needs the object URL a moment after the click starts the download (Safari on iPhone more).
const RELEASE_DOWNLOAD_MS = 60_000;
// The label holds a few letters at most; a longer ending (or none) shows no label, just the sheet.
const MAX_LABEL = 4;

/** The label's colour by kind, so files tell apart at a glance; anything else is grey. */
type Kind = "pdf" | "word" | "excel" | "slides" | "other";

const KIND_BY_EXTENSION: Record<string, Kind> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  odt: "word",
  rtf: "word",
  txt: "word",
  xls: "excel",
  xlsx: "excel",
  ods: "excel",
  csv: "excel",
  ppt: "slides",
  pptx: "slides",
  odp: "slides",
  key: "slides",
};

/** A file picked in the form and not uploaded yet. key tells two files with the same name apart. */
export interface PendingFile {
  key: number;
  file: File;
}

let nextKey = 1;

/** Wraps picked files for the editor's state. */
export function toPending(files: File[]): PendingFile[] {
  return files.map((file) => ({ key: nextKey++, file }));
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** The ending of a file name ("pdf" for "פרוטוקול.pdf"), lower case; "" when there is none. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** A white sheet with a folded corner, and the file's ending on a small coloured label over its bottom. */
function FileIcon({ name }: { name: string }) {
  const extension = extensionOf(name);
  const kind = KIND_BY_EXTENSION[extension] ?? "other";
  const label = extension.length > 0 && extension.length <= MAX_LABEL ? extension.toUpperCase() : null;
  return (
    <span className={styles.icon} aria-hidden="true">
      <svg viewBox="0 0 32 40">
        <path className={styles.sheet} d="M5 1h15l9 9v27a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" />
        <path className={styles.fold} d="M20 1v7a2 2 0 0 0 2 2h7" />
      </svg>
      {label && <span className={`${styles.label} ${styles[kind]}`}>{label}</span>}
    </span>
  );
}

interface Props {
  /** null for a summary that was never saved: it has no files on the server yet. */
  meetingId: number | null;
  /** The files the server has. */
  saved: MeetingAttachment[];
  pending: PendingFile[];
  /** Saved files that "save" will delete. */
  removed: ReadonlySet<number>;
  /** Only committee and admin may delete a saved file (the server refuses team too). */
  canRemoveSaved: boolean;
  /** While saving, nothing here may change. */
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemovePending: (key: number) => void;
  /** Marks a saved file for removal, or takes the mark back. */
  onToggleRemoved: (id: number) => void;
  onError: (message: string) => void;
}

export default function MeetingFiles({
  meetingId,
  saved,
  pending,
  removed,
  canRemoveSaved,
  disabled,
  onAdd,
  onRemovePending,
  onToggleRemoved,
  onError,
}: Props) {
  const { token, onAuthError } = useAdmin();
  const picker = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    // Empty again, so picking the same file a second time still counts as a change.
    event.currentTarget.value = "";
    const tooBig = files.find((file) => file.size > MAX_FILE_BYTES);
    const empty = files.find((file) => file.size === 0);
    onAdd(files.filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES));
    if (tooBig) onError(`הקובץ "${tooBig.name}" גדול מדי: עד ${MAX_FILE_MB}MB לקובץ.`);
    else if (empty) onError(`הקובץ "${empty.name}" ריק.`);
  }

  /** Fetches the file with the token and hands it to the browser as a download with its own name. */
  async function download(file: MeetingAttachment) {
    if (meetingId === null) return;
    setDownloading(file.id);
    try {
      const blob = await downloadAttachment(token, meetingId, file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.file_name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), RELEASE_DOWNLOAD_MS);
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else onError(`לא הצלחנו להוריד את "${file.file_name}". אפשר לנסות שוב.`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>קבצים מצורפים</h2>
      <ul className={styles.group}>
        {saved.map((file) => {
          const gone = removed.has(file.id);
          return (
            <li key={`saved-${file.id}`} className={styles.item}>
              <button
                type="button"
                className={`${styles.file} ${styles.interactive}`}
                disabled={gone || downloading === file.id}
                onClick={() => void download(file)}
              >
                <FileIcon name={file.file_name} />
                <span className={styles.info}>
                  <span className={gone ? `${styles.name} ${styles.gone}` : styles.name}>
                    <bdi>{file.file_name}</bdi>
                  </span>
                  <span className={styles.detail}>
                    {gone ? (
                      "יימחק בשמירה"
                    ) : downloading === file.id ? (
                      "מוריד…"
                    ) : (
                      <>
                        {formatSize(file.size_bytes)} · <bdi>{file.uploaded_by_name}</bdi>
                      </>
                    )}
                  </span>
                </span>
              </button>
              {canRemoveSaved && (
                <button
                  type="button"
                  className={gone ? styles.undo : styles.remove}
                  disabled={disabled}
                  onClick={() => onToggleRemoved(file.id)}
                >
                  {gone ? "ביטול" : "הסרה"}
                </button>
              )}
            </li>
          );
        })}
        {pending.map(({ key, file }) => (
          <li key={`pending-${key}`} className={styles.item}>
            <span className={styles.file}>
              <FileIcon name={file.name} />
              <span className={styles.info}>
                <span className={styles.name}>
                  <bdi>{file.name}</bdi>
                </span>
                <span className={styles.detail}>{formatSize(file.size)} · יועלה בשמירה</span>
              </span>
            </span>
            <button type="button" className={styles.remove} disabled={disabled} onClick={() => onRemovePending(key)}>
              הסרה
            </button>
          </li>
        ))}
        <li className={styles.item}>
          <button
            type="button"
            className={`${styles.file} ${styles.interactive} ${styles.add}`}
            disabled={disabled}
            onClick={() => picker.current?.click()}
          >
            {/* In the icon's place, so "add" lines up with the files above it. */}
            <span className={styles.addIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            הוספת קובץ
          </button>
        </li>
      </ul>
      <p className={styles.footer}>
        כל סוג קובץ, עד {MAX_FILE_MB}MB לקובץ. לחיצה על קובץ שמור מורידה אותו.
      </p>
      <input ref={picker} type="file" multiple hidden onChange={pick} />
    </section>
  );
}
