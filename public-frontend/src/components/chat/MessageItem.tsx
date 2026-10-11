import type { Message } from "../../api/chat";
import styles from "./MessageItem.module.css";

const relativeTime = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
const fullDate = new Intl.DateTimeFormat("he", { dateStyle: "medium", timeStyle: "short" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** Relative time in Hebrew ("5 minutes ago", "yesterday"); under a minute reads as "now". */
function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return "עכשיו";
}

interface Props {
  message: Message;
}

export default function MessageItem({ message }: Props) {
  return (
    <article className={styles.message}>
      <header className={styles.meta}>
        <span className={styles.nickname}>{message.nickname}</span>
        <time dateTime={message.created_at} title={fullDate.format(new Date(message.created_at))}>
          {timeAgo(message.created_at)}
        </time>
        {message.edited_at && <span className={styles.edited}>(נערך)</span>}
      </header>

      {message.reply_to_id !== null && (
        <blockquote className={styles.quote}>
          {message.reply_to_deleted ? (
            <span className={styles.deleted}>ההודעה נמחקה</span>
          ) : (
            <>
              <span className={styles.quoteAuthor}>{message.reply_to_nickname}</span>
              <span className={styles.quoteText} dir="auto">
                {message.reply_to_content}
              </span>
            </>
          )}
        </blockquote>
      )}

      {/* dir="auto": a message written in English is shown left-to-right. */}
      <p className={styles.content} dir="auto">
        {message.content}
      </p>

      <footer className={styles.actions}>
        <span aria-label={`${message.like_count} לייקים`}>👍 {message.like_count}</span>
      </footer>
    </article>
  );
}