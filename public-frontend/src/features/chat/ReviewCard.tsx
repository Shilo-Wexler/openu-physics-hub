/** One review and its thread. Replies go through the page's one writing bar (replyBar.tsx). */

import type { Reply, Review } from "../../shared/api/chat";
import MessageItem from "./MessageItem";
import { useReplyBar } from "./replyBar";
import ReplyThread from "./ReplyThread";

interface Props {
  review: Review;
  courseId: number;
  /** Marks the review itself and scrolls to it (a shared link to the review). */
  highlighted?: boolean;
  /** A reply to open the thread at and mark (a shared link to a reply). */
  highlightReplyId?: number | null;
}

export default function ReviewCard({
  review,
  courseId,
  highlighted = false,
  highlightReplyId = null,
}: Props) {
  const { target, startReply, stopReply } = useReplyBar();
  // The message being answered, only when the open reply belongs to this review's thread.
  const replyingTo = target?.reviewId === review.id ? target.message : null;

  function replyTo(message: Review | Reply) {
    startReply({ reviewId: review.id, message });
  }

  // Closes the reply only if it is in this thread: "hide" here must not close a reply
  // the reader is writing under another review.
  function stopHere() {
    if (replyingTo !== null) stopReply();
  }

  return (
    <MessageItem
      message={review}
      courseId={courseId}
      highlighted={highlighted}
      onReply={() => replyTo(review)}
    >
      <ReplyThread
        courseId={courseId}
        reviewId={review.id}
        replyCount={review.reply_count}
        highlightId={highlightReplyId}
        replyingTo={replyingTo}
        onReply={replyTo}
        onDoneReplying={stopHere}
      />
    </MessageItem>
  );
}