import { useEffect, useState } from "react";

import { listReplies, postMessage, type Reply, type Review } from "../../shared/api/chat";
import { useAuth } from "../auth/AuthContext";
import Composer from "./Composer";
import MessageItem from "./MessageItem";
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

/** The replies under one review: closed behind "show N replies" until the reader opens it. */
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
  const [open, setOpen] = useState(highlightId !== null);
  // null until the first page arrives. Replies stay loaded after "hide", so reopening is instant.
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Replies this reader added here, so "show N replies" stays right without a reload.
  const [added, setAdded] = useState(0);

  // Answering something always shows the thread.
  const isOpen = open || replyingTo !== null;

  async function load(after?: number) {
    setLoading(true);
    setFailed(false);
    try {
      const page = await listReplies(reviewId, after);
      setReplies((current) => {
        // The first page replaces, so loading it twice (React's dev mode does) adds nothing twice.
        if (after === undefined) return page.replies;
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
    if (!user || !replyingTo) return;
    // Answering a reply quotes it; answering the review itself needs no quote.
    const quoted = replyingTo.id === reviewId ? null : (replyingTo as Reply);
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
    setAdded((count) => count + 1);
    try {
      const saved = await postMessage(courseId, content, replyingTo.id);
      setReplies((current) =>
        (current ?? []).map((reply) =>
          reply.id === tempId ? { ...reply, id: saved.id, created_at: saved.created_at } : reply,
        ),
      );
      onDoneReplying();
    } catch (error) {
      setReplies((current) => (current ?? []).filter((reply) => reply.id !== tempId));
      setAdded((count) => count - 1);
      throw error; // the composer shows the reason and gives the text back
    }
  }

  function show() {
    setOpen(true);
  }

  function hide() {
    setOpen(false);
    onDoneReplying();
  }

  const total = replyCount + added;

  if (!isOpen) {
    if (total === 0) return null;
    return (
      <button className={styles.toggle} type="button" onClick={show}>
        {total === 1 ? "הצג תגובה אחת" : `הצג ${total} תגובות`}
      </button>
    );
  }

  return (
    <div className={styles.thread}>
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
          <button className={styles.toggle} type="button" onClick={hide}>
            הסתר
          </button>
        )}
      </div>

      {/* The box waits for the first page, so a new reply lands after the loaded ones. */}
      {replyingTo && replies !== null && (
        <Composer
          placeholder="כתבו תגובה..."
          label="תגובה חדשה"
          replyingTo={replyingTo.deleted ? null : { nickname: replyingTo.nickname }}
          onCancel={onDoneReplying}
          onSend={send}
          autoFocus
        />
      )}
    </div>
  );
}
