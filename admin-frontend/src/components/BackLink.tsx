import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router";

import styles from "./BackLink.module.css";
import { useConfirm } from "./ConfirmSheet";

interface Props {
  to: string;
  /** The screen it goes back to, such as "פניות". */
  label: string;
  /** When set (unsaved changes), asked first; "keep editing" stays on the screen. */
  confirm?: string;
}

/** The "‹ פניות" link at the top of a screen opened from a list, like the iOS back button. */
export default function BackLink({ to, label, confirm }: Props) {
  const ask = useConfirm();
  const navigate = useNavigate();

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!confirm) return;
    // The answer comes later, so the link never goes by itself; it goes after a "yes".
    event.preventDefault();
    if (await ask({ message: confirm, action: "יציאה בלי שמירה", cancel: "המשך עריכה", danger: true })) {
      navigate(to);
    }
  }

  return (
    <Link to={to} className={styles.back} aria-label={`חזרה ל${label}`} onClick={(event) => void onClick(event)}>
      {/* Points right: in a right-to-left page, back is to the right. */}
      <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
      {label}
    </Link>
  );
}
