/** /chat: where the reader picks the general chat or the course chats. Phone only: on a computer the
    general chat opens instead, since its side list already leads to every course. */

import { Navigate } from "react-router";

import { useIsDesktop } from "../../shared/browser/useIsDesktop";
import LinkRows from "../../shared/components/LinkRows";
import { COURSE_CHATS_ROW, GENERAL_CHAT_ROW } from "./chatRows";
import styles from "./ChatHubPage.module.css";

export default function ChatHubPage() {
  const isDesktop = useIsDesktop();

  // replace: the back button skips /chat, which would only send the reader here again.
  if (isDesktop) return <Navigate to={GENERAL_CHAT_ROW.to} replace />;

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
