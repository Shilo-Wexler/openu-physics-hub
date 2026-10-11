import type { Message } from "../../api/chat";
import MessageItem from "./MessageItem";
import styles from "./MessageList.module.css";

interface Props {
  messages: Message[]; // newest first, as the server sends them
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export default function MessageList({ messages, hasMore, loadingMore, onLoadMore }: Props) {
  if (messages.length === 0) {
    return <p className={styles.empty}>עוד אין הודעות בקורס הזה. אפשר להיות הראשונים לכתוב.</p>;
  }

  return (
    <div className={styles.container}>
      <ol className={styles.list}>
        {messages.map((message) => (
          <li key={message.id}>
            <MessageItem message={message} />
          </li>
        ))}
      </ol>

      {hasMore && (
        <button className={styles.more} type="button" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? "טוען..." : "הודעות קודמות"}
        </button>
      )}
    </div>
  );
}