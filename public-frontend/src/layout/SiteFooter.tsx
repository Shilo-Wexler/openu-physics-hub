import { Link } from "react-router";

import styles from "./SiteFooter.module.css";

/** The small footer on every page: the student-run notice and the about/privacy link. */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span>אתר שמנוהל על ידי סטודנטים. לא אתר רשמי של האוניברסיטה הפתוחה.</span>
      <Link to="/about" className={styles.link}>
        אודות ופרטיות
      </Link>
    </footer>
  );
}
