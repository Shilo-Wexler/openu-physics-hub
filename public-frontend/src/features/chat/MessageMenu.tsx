import { useEffect, useRef, useState } from "react";

import { messageUrl, shareLink } from "./share";
import styles from "./MessageMenu.module.css";

interface Props {
  courseId: number;
  messageId: number;
}

// How long "link copied" stays on the button.
const COPIED_MS = 2000;

/** The ⋯ menu of a message. For now only "share"; report, edit and delete come with sign-in. */
export default function MessageMenu({ courseId, messageId }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close on a click outside the menu or on Escape, as menus usually do.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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
    setOpen(false);
    try {
      if ((await shareLink(messageUrl(courseId, messageId))) === "copied") setCopied(true);
    } catch (error) {
      console.error(error);
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
        onClick={() => setOpen((current) => !current)}
      >
        {copied ? "הקישור הועתק" : "⋯"}
      </button>
      {open && (
        <ul className={styles.items} role="menu">
          <li role="none">
            <button className={styles.item} type="button" role="menuitem" onClick={share}>
              שיתוף
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}