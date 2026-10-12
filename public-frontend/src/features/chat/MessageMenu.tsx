import { useEffect, useRef, useState } from "react";

import { reportMessage } from "../../shared/api/chat";
import { ApiError } from "../../shared/api/client";
import { useAuth } from "../auth/AuthContext";
import { messageUrl, shareLink } from "./share";
import styles from "./MessageMenu.module.css";

interface Props {
  courseId: number;
  messageId: number;
  /** Shows "edit" (the reader's own message); called when it is picked. */
  onEdit?: () => void;
  /** Shows "delete" (the reader's own message); called once the reader confirmed. */
  onDelete?: () => void;
  /** Shows "report" (someone else's message). Guests are asked to sign in first. */
  reportable?: boolean;
}

// An action that needs a second click, so a slip of the finger does nothing.
type Confirm = "delete" | "report";

const QUESTIONS: Record<Confirm, string> = {
  delete: "למחוק את ההודעה?",
  report: "לדווח על ההודעה?",
};
const CONFIRM_LABELS: Record<Confirm, string> = {
  delete: "כן, למחוק",
  report: "כן, לדווח",
};

// How long a short notice ("link copied", "reported") stays on the button.
const NOTICE_MS = 2000;

/** The ⋯ menu of a message: share and report, and edit or delete for the reader's own messages. */
export default function MessageMenu({
  courseId,
  messageId,
  onEdit,
  onDelete,
  reportable = false,
}: Props) {
  const { requireSignIn } = useAuth();
  const [open, setOpen] = useState(false);
  // An action picked once: the menu now asks to confirm it instead of listing actions.
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setConfirming(null);
  }

  // Close on a click outside the menu or on Escape, as menus usually do.
  useEffect(() => {
    if (!open) return;
    function dismiss() {
      setOpen(false);
      setConfirming(null);
    }
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) dismiss();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function share() {
    close();
    try {
      if ((await shareLink(messageUrl(courseId, messageId))) === "copied") {
        setNotice("הקישור הועתק");
      }
    } catch (error) {
      console.error(error);
    }
  }

  function askToReport() {
    // A guest gets the sign-in dialog; the menu closes so it does not sit behind it.
    if (!requireSignIn()) {
      close();
      return;
    }
    setConfirming("report");
  }

  async function report() {
    close();
    try {
      await reportMessage(messageId);
      setNotice("תודה, הדיווח נשלח");
    } catch (error) {
      // 409: this reader already reported it, and the report is still waiting for review.
      if (error instanceof ApiError && error.status === 409) {
        setNotice("כבר דיווחת, ההודעה בבדיקה");
      } else {
        console.error(error);
        setNotice("הדיווח נכשל, נסו שוב");
      }
    }
  }

  function confirm(action: Confirm) {
    if (action === "delete") {
      close();
      onDelete?.();
    } else {
      void report();
    }
  }

  return (
    <div className={styles.menu} ref={root}>
      <button
        className={styles.trigger}
        type="button"
        aria-label="אפשרויות"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {notice ?? "⋯"}
      </button>
      {open && (
        <ul className={styles.items} role="menu">
          {confirming ? (
            <>
              <li role="none">{QUESTIONS[confirming]}</li>
              <li role="none">
                <button
                  className={styles.item}
                  type="button"
                  role="menuitem"
                  onClick={() => confirm(confirming)}
                >
                  {CONFIRM_LABELS[confirming]}
                </button>
              </li>
              <li role="none">
                <button className={styles.item} type="button" role="menuitem" onClick={close}>
                  ביטול
                </button>
              </li>
            </>
          ) : (
            <>
              <li role="none">
                <button className={styles.item} type="button" role="menuitem" onClick={share}>
                  שיתוף
                </button>
              </li>
              {onEdit && (
                <li role="none">
                  <button
                    className={styles.item}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      onEdit();
                    }}
                  >
                    עריכה
                  </button>
                </li>
              )}
              {onDelete && (
                <li role="none">
                  <button
                    className={styles.item}
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirming("delete")}
                  >
                    מחיקה
                  </button>
                </li>
              )}
              {reportable && (
                <li role="none">
                  <button
                    className={styles.item}
                    type="button"
                    role="menuitem"
                    onClick={askToReport}
                  >
                    דיווח
                  </button>
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}