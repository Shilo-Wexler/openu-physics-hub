import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { listReplies, postMessage, type Reply, type Review } from "../../shared/api/chat";
import { useAuth } from "../auth/AuthContext";
import Composer from "./Composer";
import MessageItem from "./MessageItem";
import { useReplyBar } from "./replyBar";
import styles from "./ReplyThread.module.css";

interface Props {
  courseId: number;
  reviewId: number;
  replyCount: number;
  /** Opens the thread right away and marks this reply (a shared link to a reply). */
  highlightId?: number | null;
  /** The message the reader is answering (the review or a reply in it), or null. */
  replyingTo: Review | Reply | null;
  /** The reader pressed "reply" on a reply in this thread. */
  onReply: (message: Reply) => void;
  /** The reply was sent or given up: close the box. */
  onDoneReplying: () => void;
}

/**
 * The replies under one review: closed behind "show N replies" until the reader opens it.
 * Its reply box is shown in the page's bottom bar (a portal), but its logic stays here.
 */
export default function ReplyThread({
  courseId,
  reviewId,
  replyCount,
  highlightId = null,
  replyingTo,
  onReply,
  onDoneReplying,
}: Props) {
  const { user } = useAuth();
  const { slot } = useReplyBar();
  const [open, setOpen] = useState(highlightId !== null);
  // null until the first page arrives. Replies stay loaded after "hide", so reopening is instant.
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Replies this reader added minus those they deleted here, so "show N replies" stays right
  // without a reload.
  const [countChange, setCountChange] = useState(0);

  // What is answered right now. A send that finishes later reads it to see if the reader moved on.
  const currentTarget = useRef(replyingTo);
  useEffect(() => {
    currentTarget.current = replyingTo;
  }, [replyingTo]);

  // The same object while the target is the same, so the composer does not take the focus
  // again (and reopen the phone keyboard) on every render.
  const quote = useMemo(
    () => (replyingTo && !replyingTo.deleted ? { nickname: replyingTo.nickname } : null),
    [replyingTo],
  );

  // Answering something always shows the thread.
  const isOpen = open || replyingTo !== null;

  async function load(after?: number) {
    setLoading(true);
    setFailed(false);
    try {
      const page = await listReplies(reviewId, after);
      setReplies((current) => {
        if (after === undefined) {
          // The first page replaces, so loading it twice (React's dev mode does) adds nothing
          // twice. A reply sent before it arrived is kept, after the loaded ones.
          const loaded = new Set(page.replies.map((reply) => reply.id));
          return [...page.replies, ...(current ?? []).filter((reply) => !loaded.has(reply.id))];
        }
        // A reply sent here can come back in a later page; skip what is already shown.
        const shown = new Set((current ?? []).map((reply) => reply.id));
        return [...(current ?? []), ...page.replies.filter((reply) => !shown.has(reply.id))];
      });
      setNextAfter(page.next_after);
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // A thread that opens (a shared link, or the reader pressed "reply") loads its first page.
  useEffect(() => {
    if (isOpen && replies === null && !loading && !failed) void load();
    // load is recreated each render; the conditions listed are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, replies, loading, failed]);

  async function send(content: string) {
    const target = replyingTo;
    if (!user || !target) return;
    // The thread stays open after the box closes, so the reader sees the reply they sent.
    setOpen(true);
    // Answering a reply quotes it; answering the review itself needs no quote.
    const quoted = target.id === reviewId ? null : (target as Reply);
    const tempId = -Date.now();
    const draft: Reply = {
      id: tempId,
      created_at: new Date().toISOString(),
      edited_at: null,
      like_count: 0,
      liked_by_me: false,
      is_mine: true,
      deleted: false,
      nickname: user.nickname,
      avatar: user.avatar,
      content,
      reply_to_id: quoted?.id ?? null,
      reply_to_deleted: false,
      reply_to_nickname: quoted?.nickname ?? null,
      reply_to_content: quoted?.content ?? null,
    };
    setReplies((current) => [...(current ?? []), draft]);
    setCountChange((count) => count + 1);
    try {
      const saved = await postMessage(courseId, content, target.id);
      setReplies((current) =>
        (current ?? []).map((reply) =>
          reply.id === tempId ? { ...reply, id: saved.id, created_at: saved.created_at } : reply,
        ),
      );
      // Only if the bar still answers the same message: the reader may have pressed
      // "reply" on something else while this was sending.
      if (currentTarget.current === target) onDoneReplying();
    } catch (error) {
      setReplies((current) => (current ?? []).filter((reply) => reply.id !== tempId));
      setCountChange((count) => count - 1);
      throw error; // the composer shows the reason and gives the text back
    }
  }

  // The server already deleted it (MessageItem waits for that), so nothing here is undone.
  function removeReply(id: number) {
    setReplies((current) => (current ?? []).filter((reply) => reply.id !== id));
    setCountChange((count) => count - 1);
  }

  function hide() {
    setOpen(false);
    onDoneReplying();
  }

  const total = replyCount + countChange;

  return (
    <>
      {!isOpen && total > 0 && (
        <button className={styles.toggle} type="button" onClick={() => setOpen(true)}>
          {total === 1 ? "הצג תגובה אחת" : `הצג ${total} תגובות`}
        </button>
      )}

      {/* Hidden, not removed, when closed: the replies keep what the reader changed in them
          (edits, likes), and reopening is instant. Inline style, because a display rule in
          the CSS module would override the hidden attribute. */}
      <div className={styles.thread} style={isOpen ? undefined : { display: "none" }}>
        {replies && replies.length > 0 && (
          <ol className={styles.list}>
            {replies.map((reply) => (
              <li key={reply.id}>
                <MessageItem
                  message={reply}
                  courseId={courseId}
                  compact
                  highlighted={reply.id === highlightId}
                  onReply={() => onReply(reply)}
                  onDeleted={() => removeReply(reply.id)}
                />
              </li>
            ))}
          </ol>
        )}

        {loading && <p className={styles.status}>טוען...</p>}
        {failed && (
          <button
            className={styles.toggle}
            type="button"
            onClick={() => void load(nextAfter ?? undefined)}
          >
            הטעינה נכשלה, נסו שוב
          </button>
        )}

        <div className={styles.controls}>
          {!loading && !failed && nextAfter !== null && (
            <button className={styles.toggle} type="button" onClick={() => void load(nextAfter)}>
              הצג עוד תגובות
            </button>
          )}
          {total > 0 && (
            <button className={styles.hide} type="button" onClick={hide}>
              הסתר
            </button>
          )}
        </div>
      </div>

      {/* The reply box lives in the page's bottom bar, in place of the new-review box. */}
      {replyingTo &&
        slot &&
        createPortal(
          <Composer
            sticky
            placeholder="כתבו תגובה..."
            label="תגובה חדשה"
            replyingTo={quote}
            onCancel={onDoneReplying}
            onSend={send}
            autoFocus
          />,
          slot,
        )}
    </>
  );
}
