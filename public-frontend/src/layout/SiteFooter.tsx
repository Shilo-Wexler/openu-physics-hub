import { Link } from "react-router";

import styles from "./SiteFooter.module.css";

/** The small footer on every page: links to about and to privacy and terms, each with an icon. */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links} aria-label="מידע על האתר">
        <Link to="/about" className={styles.link}>
          <InfoIcon />
          אודות
        </Link>
        <Link to="/privacy" className={styles.link}>
          <ShieldIcon />
          פרטיות ותנאי שימוש
        </Link>
      </nav>
    </footer>
  );
}

/** A circle with an "i": stands for "about". */
function InfoIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/** A shield: stands for privacy and terms. */
function ShieldIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3z" />
    </svg>
  );
}
