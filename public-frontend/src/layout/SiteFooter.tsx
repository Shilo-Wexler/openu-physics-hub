import { Link } from "react-router";

import styles from "./SiteFooter.module.css";

/** The small footer on every page: links to about and to privacy and terms. */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links} aria-label="מידע על האתר">
        <Link to="/about" className={styles.link}>
          אודות
        </Link>
        <Link to="/privacy" className={styles.link}>
          פרטיות ותנאי שימוש
        </Link>
      </nav>
    </footer>
  );
}
