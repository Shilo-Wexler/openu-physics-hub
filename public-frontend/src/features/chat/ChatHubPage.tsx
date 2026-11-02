/** /chat: where the reader picks the general chat or the course chats.
    Phone: two rows. Computer: two big cards, each with an icon and a button. */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { useIsDesktop } from "../../shared/browser/useIsDesktop";
import LinkRows, { type LinkRow } from "../../shared/components/LinkRows";
import { COURSE_CHATS_ROW, GENERAL_CHAT_ROW } from "./chatRows";
import styles from "./ChatHubPage.module.css";

interface Choice {
  row: LinkRow;
  icon: ReactNode;
  /** The words on the card's button. */
  action: string;
}

const CHOICES: Choice[] = [
  { row: GENERAL_CHAT_ROW, icon: <BubbleIcon />, action: "כניסה לצ'אט" },
  { row: COURSE_CHATS_ROW, icon: <BookIcon />, action: "בחירת קורס" },
];

export default function ChatHubPage() {
  const isDesktop = useIsDesktop();

  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>צ'אט</p>
        <h1 className={styles.title}>לאן נכנסים?</h1>
        <p className={styles.lead}>שיחה פתוחה עם כולם, או ביקורות ודירוגים של קורס מסוים.</p>
      </header>

      {isDesktop ? (
        <ChoiceCards />
      ) : (
        <LinkRows rows={CHOICES.map((choice) => choice.row)} label="בחירת צ'אט" />
      )}
    </>
  );
}

/** The computer version: each card is one link, so a click anywhere on it enters. The "button"
    inside only looks like one; a real button inside a link would be two controls in one. */
function ChoiceCards() {
  return (
    <nav aria-label="בחירת צ'אט">
      <ul className={styles.cards}>
        {CHOICES.map(({ row, icon, action }) => (
          <li key={row.to}>
            <Link to={row.to} className={styles.card}>
              <span className={styles.icon}>{icon}</span>
              <span className={styles.cardTitle}>{row.title}</span>
              <span className={styles.cardText}>{row.text}</span>
              <span className={styles.action} aria-hidden="true">
                {action}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A speech bubble: an open conversation. */
function BubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

/** A book: the courses. */
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5" />
      <path d="M9 7h6" />
    </svg>
  );
}
