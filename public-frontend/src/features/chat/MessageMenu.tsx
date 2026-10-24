import { useEffect, useRef, useState, type ReactNode } from "react";

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

// How long a short notice ("link copied", "reported") stays next to the button.
const NOTICE_MS = 2000;

// Line icons, 24x24, drawn with the item's text color.
const ICONS = {
  share: ["M12 3v13", "m7 8 5-5 5 5", "M5 14v6h14v-6"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "m14 6 4 4"],
  delete: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  report: ["M5 21V4", "M5 4h12l-2 4 2 4H5"],
};

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
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  function close() {
    setOpen(false);
    setConfirming(null);
  }

  // Close on a click outside the menu or on Escape, as menus usually do. Escape also
  // puts the focus back on ⋯, so a keyboard user is not dropped at the top of the page.
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
      if (event.key !== "Escape") return;
      dismiss();
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The focus moves into the menu when it opens, and to the confirm button when it asks.
  useEffect(() => {
    if (open) list.current?.querySelector("button")?.focus();
  }, [open, confirming]);

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
        setNotice("לא הצלחנו לשלוח את הדיווח.");
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
      {/* Read out when it appears; empty (and hidden) the rest of the time. */}
      <span className={styles.notice} role="status">
        {notice ?? ""}
      </span>
      <button
        ref={trigger}
        className={styles.trigger}
        type="button"
        aria-label="אפשרויות"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <>
          {/* Phone only (CSS): dims the page; a tap on it closes the menu. */}
          <div className={styles.backdrop} aria-hidden="true" onClick={close} />
          <ul ref={list} className={styles.items} role="menu">
            {confirming ? (
              <>
                <li role="none" className={styles.question}>
                  {QUESTIONS[confirming]}
                </li>
                <Item
                  className={[styles.confirm, confirming === "delete" && styles.danger]}
                  onClick={() => confirm(confirming)}
                >
                  {CONFIRM_LABELS[confirming]}
                </Item>
                <Item className={[styles.cancel]} onClick={close}>
                  ביטול
                </Item>
              </>
            ) : (
              <>
                <Item icon={ICONS.share} onClick={() => void share()}>
                  שיתוף
                </Item>
                {onEdit && (
                  <Item
                    icon={ICONS.edit}
                    onClick={() => {
                      close();
                      onEdit();
                    }}
                  >
                    עריכה
                  </Item>
                )}
                {reportable && (
                  <Item icon={ICONS.report} onClick={askToReport}>
                    דיווח
                  </Item>
                )}
                {onDelete && (
                  <Item
                    icon={ICONS.delete}
                    className={[styles.danger]}
                    onClick={() => setConfirming("delete")}
                  >
                    מחיקה
                  </Item>
                )}
              </>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

interface ItemProps {
  onClick: () => void;
  /** The icon's path data; no icon for the confirm step. */
  icon?: string[];
  /** Extra classes; false and undefined entries are skipped. */
  className?: (string | false | undefined)[];
  children: ReactNode;
}

/** One row of the menu. */
function Item({ onClick, icon, className = [], children }: ItemProps) {
  return (
    <li role="none">
      <button
        className={[styles.item, ...className].filter(Boolean).join(" ")}
        type="button"
        role="menuitem"
        onClick={onClick}
      >
        {icon && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {icon.map((path) => (
              <path key={path} d={path} />
            ))}
          </svg>
        )}
        {children}
      </button>
    </li>
  );
}
