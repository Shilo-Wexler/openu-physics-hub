import { useEffect, useRef, type ReactNode } from "react";

import type { Reply, Review } from "../../shared/api/chat";
import Avatar from "../../shared/components/Avatar";
import { useAuth } from "../auth/AuthContext";
import LikeButton from "./LikeButton";
import MessageMenu from "./MessageMenu";
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
  message: Review | Reply;
  courseId: number;
  /** Smaller avatar, for replies inside a thread. */
  compact?: boolean;
  /** Marked and scrolled into view: the message a shared link points at. */
  highlighted?: boolean;
  /** Shows a reply button; called when the signed-in reader wants to answer this message. */
  onReply?: () => void;
  /** Shown under the message, e.g. the replies of a review. */
  children?: ReactNode;
}

/** One review or reply: avatar, author and time, the quote it answers, text, likes and reply. */
export default function MessageItem({
  message,
  courseId,
  compact = false,
  highlighted = false,
  onReply,
  children,
}: Props) {
  const { requireSignIn } = useAuth();
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    if (highlighted) article.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  // Only replies have a quote; `in` checks that the field exists on this message.
  const hasQuote = "reply_to_id" in message && message.reply_to_id !== null;
  // A message still being sent has a temporary negative id: the server does not know it yet,
  // so liking or answering it would fail.
  const saved = message.id > 0;

  return (
    <article
      ref={article}
      className={[styles.message, compact && styles.compact, highlighted && styles.highlighted]
        .filter(Boolean)
        .join(" ")}
    >
      <Avatar avatar={message.avatar} size={compact ? 28 : 36} />

      <div className={styles.body}>
        {message.deleted ? (
          <p className={styles.deleted}>הביקורת נמחקה</p>
        ) : (
          <>
            <div className={styles.meta}>
              <span className={styles.nickname}>{message.nickname}</span>
              <time
                dateTime={message.created_at}
                title={fullDate.format(new Date(message.created_at))}
              >
                {timeAgo(message.created_at)}
              </time>
              {message.edited_at && <span>(נערך)</span>}
              {saved && <MessageMenu courseId={courseId} messageId={message.id} />}
            </div>

            {hasQuote && (
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

            {saved && (
              <div className={styles.actions}>
                <LikeButton
                  messageId={message.id}
                  liked={message.liked_by_me}
                  count={message.like_count}
                />
                {onReply && (
                  <button
                    type="button"
                    onClick={() => {
                      if (requireSignIn()) onReply();
                    }}
                  >
                    הגב
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {children}
      </div>
    </article>
  );
}
