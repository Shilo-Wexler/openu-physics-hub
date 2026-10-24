import { useEffect, useRef, useState, type ReactNode } from "react";

import { deleteMessage, editMessage, type Reply, type Review } from "../../shared/api/chat";
import { keepInSight } from "../../shared/browser/keyboard";
import Avatar from "../../shared/components/Avatar";
import { useAuth } from "../auth/AuthContext";
import LikeButton from "./LikeButton";
import MessageEditor from "./MessageEditor";
import MessageMenu from "./MessageMenu";
import { useReplyBar } from "./replyBar";
import { useSwipeToReply } from "./useSwipeToReply";
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

/** The speech-bubble icon of "reply", on the button and behind a swiped message. */
function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
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
  /** Called once the server confirmed the reader deleted this message. */
  onDeleted?: () => void;
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
  onDeleted,
  children,
}: Props) {
  const { requireSignIn } = useAuth();
  const { slot } = useReplyBar();
  const article = useRef<HTMLElement>(null);
  // The end of this message itself (a review's article also holds its whole thread).
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) article.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  // Changes the reader made here to their own message. The lists above keep the message as
  // it came from the server; this item shows it with these changes on top.
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<{ content: string; edited_at: string } | null>(null);
  const [removed, setRemoved] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Only replies have a quote; `in` checks that the field exists on this message.
  const isReply = "reply_to_id" in message;
  const hasQuote = isReply && message.reply_to_id !== null;
  // A message still being sent has a temporary negative id: the server does not know it yet,
  // so liking or answering it would fail.
  const saved = message.id > 0;

  // Swiping works wherever the reply button would show.
  const canReply = saved && onReply !== undefined && !editing && !message.deleted && !removed;
  // Called before the early return below: React needs the same hooks on every render.
  const swipe = useSwipeToReply(article, canReply ? reply : undefined);

  // A deleted reply, or a review nobody answered, disappears. A deleted review with replies
  // stays as "deleted" above them, as the server shows it after a refresh.
  const keepsPlace = !isReply && message.reply_count > 0;
  if (removed && !keepsPlace) return null;

  async function saveEdit(content: string) {
    const result = await editMessage(message.id, content);
    setEdited({ content, edited_at: result.edited_at });
    setEditing(false);
  }

  // Optimistic: the message goes at once, and comes back if the server refused.
  // The parent hears about it only after the server agreed, so it never has to undo.
  async function remove() {
    setDeleteFailed(false);
    setRemoved(true);
    try {
      await deleteMessage(message.id);
    } catch (error) {
      console.error(error);
      setRemoved(false);
      setDeleteFailed(true);
      return;
    }
    onDeleted?.();
  }

  function reply() {
    if (!onReply || !requireSignIn()) return;
    onReply();
    // The keyboard and the reply bar take the bottom of the screen; the message being
    // answered stays in sight above them. The slot itself has no box (display: contents),
    // so the bar is its child, which appears only after this render.
    if (actions.current) keepInSight(actions.current, () => slot?.firstElementChild);
  }

  const mine = saved && message.is_mine;

  return (
    <article
      ref={article}
      className={[styles.message, compact && styles.compact, highlighted && styles.highlighted]
        .filter(Boolean)
        .join(" ")}
      {...swipe}
    >
      {/* Revealed at the start edge while the message is swiped toward the end. */}
      {canReply && (
        <span className={styles.swipeIcon} aria-hidden="true">
          <ReplyIcon />
        </span>
      )}

      {/* The avatar and the message move together when swiped; the thread under a review
          (children) stays in place. */}
      <div className={styles.swipeable} data-swipe-area>
        <Avatar avatar={removed ? null : message.avatar} size={compact ? 28 : 36} />
      </div>

      <div className={styles.body}>
        <div className={styles.swipeable} data-swipe-area>
          {message.deleted || removed ? (
            <p className={styles.deleted}>ההודעה נמחקה</p>
          ) : (
            <>
              <div className={styles.meta}>
                <span className={styles.nickname}>{message.nickname}</span>
                <time
                  className={styles.detail}
                  dateTime={message.created_at}
                  title={fullDate.format(new Date(message.created_at))}
                >
                  {timeAgo(message.created_at)}
                </time>
                {(edited?.edited_at ?? message.edited_at) && (
                  <span className={styles.detail}>נערך</span>
                )}
                {saved && !editing && (
                  <span className={styles.menu}>
                    <MessageMenu
                      courseId={courseId}
                      messageId={message.id}
                      onEdit={mine ? () => setEditing(true) : undefined}
                      onDelete={mine ? () => void remove() : undefined}
                      reportable={!mine}
                    />
                  </span>
                )}
              </div>

              {deleteFailed && (
                <p className={styles.error} role="alert">
                  לא הצלחנו למחוק את ההודעה.
                </p>
              )}

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

              {editing ? (
                <MessageEditor
                  initial={edited?.content ?? message.content}
                  onSave={saveEdit}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <>
                  {/* dir="auto": a message written in English is shown left-to-right. */}
                  <p className={styles.content} dir="auto">
                    {edited?.content ?? message.content}
                  </p>

                  {saved && (
                    <div className={styles.actions} ref={actions}>
                      <LikeButton
                        messageId={message.id}
                        liked={message.liked_by_me}
                        count={message.like_count}
                      />
                      {onReply && (
                        <button type="button" className={styles.action} onClick={reply}>
                          <ReplyIcon />
                          הגב
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {children}
      </div>
    </article>
  );
}
