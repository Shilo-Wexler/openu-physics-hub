import type { MouseEvent } from "react";
import { Link } from "react-router";

import styles from "./BackLink.module.css";

interface Props {
  to: string;
  /** The screen it goes back to, such as "פניות". */
  label: string;
  /** When set (unsaved changes), asked first; "cancel" stays on the screen. */
  confirm?: string;
}

/** The "‹ פניות" link at the top of a screen opened from a list, like the iOS back button. */
export default function BackLink({ to, label, confirm }: Props) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (confirm && !window.confirm(confirm)) event.preventDefault();
  }

  return (
    <Link to={to} className={styles.back} aria-label={`חזרה ל${label}`} onClick={onClick}>
      {/* Points right: in a right-to-left page, back is to the right. */}
      <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
      {label}
    </Link>
  );
}
