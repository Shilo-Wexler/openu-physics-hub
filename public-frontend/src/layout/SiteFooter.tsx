import { Link } from "react-router";

import styles from "./SiteFooter.module.css";

/** The small footer on every page: the link to about and privacy. */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Link to="/about" className={styles.link}>
        אודות ופרטיות
      </Link>
    </footer>
  );
}
