/** One review and its thread. Knows which message the reader is answering, if any. */

import { useState } from "react";

import type { Reply, Review } from "../../shared/api/chat";
import MessageItem from "./MessageItem";
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
  // The review itself or a reply in its thread; the reply box shows while this is set.
  const [replyingTo, setReplyingTo] = useState<Review | Reply | null>(null);

  return (
    <MessageItem
      message={review}
      courseId={courseId}
      highlighted={highlighted}
      onReply={() => setReplyingTo(review)}
    >
      <ReplyThread
        courseId={courseId}
        reviewId={review.id}
        replyCount={review.reply_count}
        highlightId={highlightReplyId}
        replyingTo={replyingTo}
        onReply={setReplyingTo}
        onDoneReplying={() => setReplyingTo(null)}
      />
    </MessageItem>
  );
}
