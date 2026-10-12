import { useEffect, useRef, useState } from "react";

import { messageUrl, shareLink } from "./share";
import styles from "./MessageMenu.module.css";

interface Props {
  courseId: number;
  messageId: number;
  /** Shows "edit" (the reader's own message); called when it is picked. */
  onEdit?: () => void;
  /** Shows "delete" (the reader's own message); called once the reader confirmed. */
  onDelete?: () => void;
}

// How long "link copied" stays on the button.
const COPIED_MS = 2000;

/** The ⋯ menu of a message: share, and edit or delete for the reader's own messages. */
export default function MessageMenu({ courseId, messageId, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  // "delete" was picked once: the menu now asks to confirm instead of listing actions.
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  // Close on a click outside the menu or on Escape, as menus usually do.
  useEffect(() => {
    if (!open) return;
    function dismiss() {
      setOpen(false);
      setConfirming(false);
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
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share() {
    close();
    try {
      if ((await shareLink(messageUrl(courseId, messageId))) === "copied") setCopied(true);
    } catch (error) {
      console.error(error);
    }
  }

  // Closes the menu, then runs the action.
  function pick(action: () => void) {
    return () => {
      close();
      action();
    };
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
        {copied ? "הקישור הועתק" : "⋯"}
      </button>
      {open && (
        <ul className={styles.items} role="menu">
          {confirming && onDelete ? (
            <>
              <li role="none">למחוק את ההודעה?</li>
              <li role="none">
                <button
                  className={styles.item}
                  type="button"
                  role="menuitem"
                  onClick={pick(onDelete)}
                >
                  כן, למחוק
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
                    onClick={pick(onEdit)}
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
                    onClick={() => setConfirming(true)}
                  >
                    מחיקה
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