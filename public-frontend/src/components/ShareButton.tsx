import { useEffect, useState } from "react";

import { shareLink } from "../lib/share";
import styles from "./ShareButton.module.css";

// How long "link copied" stays on the button.
const COPIED_MS = 2000;

/** A "share" button for a whole page, e.g. a course. */
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
    <button className={styles.button} type="button" onClick={share}>
      {copied ? "הקישור הועתק" : "שיתוף"}
    </button>
  );
}