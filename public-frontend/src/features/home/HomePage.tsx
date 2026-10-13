/** /: the front page: what the site is, and a link to each main area. */

import { Link } from "react-router";

import styles from "./HomePage.module.css";

// The main areas, one row each. About is not here: it lives in the footer.
const AREAS = [
  { to: "/chat/general", title: "צ'אט כללי", text: "שיחה פתוחה על הכול: לימודים, מבחנים ומה שביניהם." },
  { to: "/courses", title: "צ'אט קורסים", text: "ביקורות ודירוגים לכל קורס, מבחירה בגלגלת." },
  {
    to: "/inquiry",
    title: "פנייה לוועדה",
    text: "בקשה או תלונה לוועדת הסטודנטים, באופן אנונימי.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>סטודנטים לפיזיקה · האוניברסיטה הפתוחה</p>
        <h1 className={styles.title}>
          מה באמת חושבים <strong>על הקורס.</strong>
        </h1>
        <p className={styles.lead}>
          ביקורות ודירוגים אמיתיים, צ'אט פתוח, ופנייה אנונימית לוועדת הסטודנטים.
        </p>
      </section>

      <nav aria-label="אזורי האתר">
        <ul className={styles.areas}>
          {AREAS.map((area) => (
            <li key={area.to}>
              <Link to={area.to} className={styles.area}>
                <span className={styles.areaText}>
                  <span className={styles.areaTitle}>{area.title}</span>
                  <span className={styles.areaDescription}>{area.text}</span>
                </span>
                {/* Points left: "forward" in a right-to-left page. */}
                <svg className={styles.arrow} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
