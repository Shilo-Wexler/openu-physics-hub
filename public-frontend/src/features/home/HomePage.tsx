/** /: the front page: what the site is, and a link to each main area. */

import LinkRows, { type LinkRow } from "../../shared/components/LinkRows";
import styles from "./HomePage.module.css";

// The main areas, one row each. About is not here: it lives in the footer.
const AREAS: LinkRow[] = [
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

      <LinkRows rows={AREAS} label="אזורי האתר" />
    </>
  );
}