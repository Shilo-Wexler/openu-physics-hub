/** /: the front page: what the site is, the committee's latest announcement, and a link to each main area. */

import { useState } from "react";

import LinkRows, { type LinkRow } from "../../shared/components/LinkRows";
import LatestAnnouncement from "../announcements/LatestAnnouncement";
import { COURSE_CHATS_ROW, GENERAL_CHAT_ROW } from "../chat/chatRows";
import styles from "./HomePage.module.css";

/* Thin line icons for the areas (computer only), drawn like the rest of the site's icons. */
function CourseChatsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function GeneralChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h12v8H7l-4 3z" />
      <path d="M18 9h3v9l-3-2h-7v-2" />
    </svg>
  );
}

function AnnouncementsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h3l7 4V6l-7 4z" />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

function InquiryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function DegreePlanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 9.5 12 5l9.5 4.5L12 14z" />
      <path d="M6.5 11.5V16c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5" />
    </svg>
  );
}

// The main areas, one row each, plus one useful site outside ours. About is not here: it
// lives in the footer.
const AREAS: LinkRow[] = [
  { ...GENERAL_CHAT_ROW, icon: <GeneralChatIcon /> },
  { ...COURSE_CHATS_ROW, icon: <CourseChatsIcon /> },
  {
    to: "/announcements",
    title: "הכרזות",
    text: "עדכונים והודעות מוועד הסטודנטים.",
    icon: <AnnouncementsIcon />,
  },
  {
    to: "/inquiry",
    title: "פנייה לוועד",
    text: "בקשה או תלונה לוועד הסטודנטים, באופן אנונימי.",
    icon: <InquiryIcon />,
  },
  {
    to: "https://planmytoar.com",
    title: "תכנון התואר",
    text: "בניית תוכנית לימודים לתואר, באתר planmytoar.com.",
    external: true,
    icon: <DegreePlanIcon />,
  },
];

// Phone: full-width bands, top to bottom: the intro, the announcement, the areas (rows).
// Computer with a pinned announcement: the intro as a band on top, then two columns that
// start and end on the same lines: the areas (rows, stretched) on the right, the announcement
// on the left. Computer without one: as on the phone, but the areas are tiles side by side.
export default function HomePage() {
  const [hasPinned, setHasPinned] = useState(false);

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

      {/* The announcement comes first, so the phone shows it above the areas. */}
      <div className={hasPinned ? styles.columns : undefined}>
        {/* Shows nothing until there is an announcement, so the page looks the same without one. */}
        <div className={styles.side}>
          <LatestAnnouncement onShow={() => setHasPinned(true)} />
        </div>

        <div className={styles.areas}>
          {/* A small title in line with the announcement's own (computer, beside it only). */}
          {hasPinned && <h2 className={styles.areasTitle}>באתר</h2>}
          <LinkRows
            rows={AREAS}
            label="אזורי האתר"
            tilesOnDesktop={!hasPinned}
            fillOnDesktop={hasPinned}
          />
        </div>
      </div>
    </>
  );
}
