/** /: the front page: what the site is, the committee's latest announcement, and a link to each main area. */

import LinkRows, { type LinkRow } from "../../shared/components/LinkRows";
import LatestAnnouncement from "../announcements/LatestAnnouncement";
import styles from "./HomePage.module.css";

// The main areas, one row each, plus one useful site outside ours. About is not here: it
// lives in the footer.
const AREAS: LinkRow[] = [
  { to: "/chat/general", title: "צ'אט כללי", text: "שיחה פתוחה על הכול: לימודים, מבחנים ומה שביניהם." },
  { to: "/courses", title: "צ'אט קורסים", text: "ביקורות ודירוגים לכל קורס, מבחירה בגלגלת." },
  { to: "/announcements", title: "הכרזות", text: "עדכונים והודעות מוועדת הסטודנטים." },
  {
    to: "/inquiry",
    title: "פנייה לוועדה",
    text: "בקשה או תלונה לוועדת הסטודנטים, באופן אנונימי.",
  },
  {
    to: "https://planmytoar.com",
    title: "תכנון התואר",
    text: "בניית תוכנית לימודים לתואר, באתר planmytoar.com.",
    external: true,
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

      {/* Shows nothing until there is an announcement, so the page looks the same without one. */}
      <LatestAnnouncement />

      <LinkRows rows={AREAS} label="אזורי האתר" />
    </>
  );
}
