/** /chat: where the reader picks the general chat or the course chats. */

import { GENERAL_COURSE_ID } from "../../shared/api/chat";
import LinkRows, { type LinkRow } from "../../shared/components/LinkRows";
import { coursePath } from "./share";
import styles from "./ChatHubPage.module.css";

// The same rows and words as on the home page, so each chat reads the same everywhere.
const CHATS: LinkRow[] = [
  {
    to: coursePath(GENERAL_COURSE_ID),
    title: "צ'אט כללי",
    text: "שיחה פתוחה על הכול: לימודים, מבחנים ומה שביניהם.",
  },
  { to: "/courses", title: "צ'אט קורסים", text: "ביקורות ודירוגים לכל קורס, מבחירה בגלגלת." },
];

export default function ChatHubPage() {
  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>צ'אט</p>
        <h1 className={styles.title}>לאן נכנסים?</h1>
        <p className={styles.lead}>שיחה פתוחה עם כולם, או ביקורות ודירוגים של קורס מסוים.</p>
      </header>

      <LinkRows rows={CHATS} label="בחירת צ'אט" />
    </>
  );
}
