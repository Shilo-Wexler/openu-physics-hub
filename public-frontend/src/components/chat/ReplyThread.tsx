import { useState } from "react";

import { listReplies, type Reply } from "../../api/chat";
import MessageItem from "./MessageItem";
import styles from "./ReplyThread.module.css";

interface Props {
  reviewId: number;
  replyCount: number;
}

/** The replies under one review: closed behind "show N replies" until the reader opens it. */
export default function ReplyThread({ reviewId, replyCount }: Props) {
  const [open, setOpen] = useState(false);
  // null until the first page arrives. Replies stay loaded after "hide", so reopening is instant.
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(after?: number) {
    setLoading(true);
    setFailed(false);
    try {
      const page = await listReplies(reviewId, after);
      setReplies((current) => [...(current ?? []), ...page.replies]);
      setNextAfter(page.next_after);
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function show() {
    setOpen(true);
    if (replies === null) void load();
  }

  if (!open) {
    return (
      <button className={styles.toggle} type="button" onClick={show}>
        {replyCount === 1 ? "הצג תגובה אחת" : `הצג ${replyCount} תגובות`}
      </button>
    );
  }

  return (
    <div className={styles.thread}>
      {replies && (
        <ol className={styles.list}>
          {replies.map((reply) => (
            <li key={reply.id}>
              <MessageItem message={reply} compact />
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
        <button className={styles.toggle} type="button" onClick={() => setOpen(false)}>
          הסתר
        </button>
      </div>
    </div>
  );
}