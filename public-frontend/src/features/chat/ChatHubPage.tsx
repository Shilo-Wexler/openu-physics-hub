/** /chat: where the reader picks the general chat or the course chats. */

import LinkRows from "../../shared/components/LinkRows";
import { COURSE_CHATS_ROW, GENERAL_CHAT_ROW } from "./chatRows";
import styles from "./ChatHubPage.module.css";

export default function ChatHubPage() {
  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>צ'אט</p>
        <h1 className={styles.title}>לאן נכנסים?</h1>
        <p className={styles.lead}>שיחה פתוחה עם כולם, או ביקורות ודירוגים של קורס מסוים.</p>
      </header>

      <LinkRows rows={[GENERAL_CHAT_ROW, COURSE_CHATS_ROW]} label="בחירת צ'אט" />
    </>
  );
}