import { Link } from "react-router";

import styles from "./NotFoundPage.module.css";

/** Any address the site does not know (the "*" route in App.tsx). */
export default function NotFoundPage() {
  return (
    <section className={styles.page}>
      {/* Decoration: the heading below says the same in words. */}
      <p className={styles.code} aria-hidden="true">
        404
      </p>
      <h1 className={styles.title}>הדף לא נמצא</h1>
      <p className={styles.text}>אולי הקישור ישן, או שהייתה טעות בכתובת.</p>
      <Link to="/" className={styles.home}>
        לדף הבית
      </Link>
    </section>
  );
}
