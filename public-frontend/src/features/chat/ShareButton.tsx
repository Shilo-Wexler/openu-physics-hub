import { useEffect, useState } from "react";

import { shareLink } from "./share";
import styles from "./ShareButton.module.css";

// How long "link copied" stays next to the button.
const COPIED_MS = 2000;

/** A "share" icon button for a whole page, e.g. a course. */
export default function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share() {
    try {
      if ((await shareLink(url)) === "copied") setCopied(true);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <span className={styles.wrapper}>
      {/* Read out when it appears; empty the rest of the time. */}
      <span className={styles.copied} role="status">
        {copied ? "הקישור הועתק" : ""}
      </span>
      <button className={styles.button} type="button" aria-label="שיתוף" onClick={() => void share()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v13" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 14v6h14v-6" />
        </svg>
      </button>
    </span>
  );
}
