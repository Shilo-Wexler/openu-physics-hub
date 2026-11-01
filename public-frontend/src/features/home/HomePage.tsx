/** /: the front page: what the site is, the committee's latest announcement, and a link to each main area. */

import LinkRows, { type LinkRow } from "../../shared/components/LinkRows";
import LatestAnnouncement from "../announcements/LatestAnnouncement";
import { COURSE_CHATS_ROW, GENERAL_CHAT_ROW } from "../chat/chatRows";
import styles from "./HomePage.module.css";

// The main areas, one row each, plus one useful site outside ours. About is not here: it
// lives in the footer.
const AREAS: LinkRow[] = [
  GENERAL_CHAT_ROW,
  COURSE_CHATS_ROW,
  { to: "/announcements", title: "הכרזות", text: "עדכונים והודעות מוועד הסטודנטים." },
  {
    to: "/inquiry",
    title: "פנייה לוועד",
    text: "בקשה או תלונה לוועד הסטודנטים, באופן אנונימי.",
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
          ביקורות ודירוגים מסטודנטים שכבר למדו את הקורס, צ'אט פתוח, ופנייה אנונימית לוועד הסטודנטים.
        </p>
      </section>

      {/* Shows nothing until there is an announcement, so the page looks the same without one. */}
      <LatestAnnouncement />

      <LinkRows rows={AREAS} label="אזורי האתר" />
    </>
  );
}
