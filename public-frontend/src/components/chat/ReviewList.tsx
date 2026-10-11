import { useCallback, useEffect, useRef, useState } from "react";

import { listReviews, type Review, type ReviewSort } from "../../api/chat";
import MessageItem from "./MessageItem";
import ReplyThread from "./ReplyThread";
import styles from "./ReviewList.module.css";

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: "new", label: "חדשות" },
  { value: "top", label: "מובילות" },
];

/** The reviews of a course, with sort tabs above them. */
export default function ReviewList({ courseId }: { courseId: number }) {
  const [sort, setSort] = useState<ReviewSort>("new");

  return (
    <section>
      <div className={styles.tabs} role="tablist" aria-label="מיון ביקורות">
        {SORTS.map(({ value, label }) => (
          <button
            key={value}
            className={value === sort ? `${styles.tab} ${styles.active}` : styles.tab}
            type="button"
            role="tab"
            aria-selected={value === sort}
            onClick={() => setSort(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* key: another sort mounts a fresh list, so pages of the old sort never mix in. */}
      <SortedReviews key={sort} courseId={courseId} sort={sort} />
    </section>
  );
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; reviews: Review[]; nextBefore: number | null };

function SortedReviews({ courseId, sort }: { courseId: number; sort: ReviewSort }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  // Aborts requests still running when this list goes away (another sort or another page).
  const controller = useRef(new AbortController());
  // An empty element after the last review. When it scrolls into view, the next page loads.
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    listReviews(courseId, { sort }, current.signal)
      .then((page) =>
        setState({ status: "ready", reviews: page.messages, nextBefore: page.next_before }),
      )
      .catch((error: unknown) => {
        if (current.signal.aborted) return;
        console.error(error);
        setState({ status: "error" });
      });
    return () => current.abort();
  }, [courseId, sort]);

  const nextBefore = state.status === "ready" ? state.nextBefore : null;

  const loadMore = useCallback(async () => {
    if (nextBefore === null) return;
    const { signal } = controller.current;
    setLoadingMore(true);
    try {
      const page = await listReviews(courseId, { sort, before: nextBefore }, signal);
      setState((current) => {
        if (current.status !== "ready") return current;
        // With sort=top a review can move to a later page while likes change; skip repeats.
        const shown = new Set(current.reviews.map((review) => review.id));
        return {
          status: "ready",
          reviews: [...current.reviews, ...page.messages.filter((review) => !shown.has(review.id))],
          nextBefore: page.next_before,
        };
      });
    } catch (error) {
      if (!signal.aborted) console.error(error);
    } finally {
      if (!signal.aborted) setLoadingMore(false);
    }
  }, [courseId, sort, nextBefore]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || nextBefore === null || loadingMore) return;
    // rootMargin: start loading a little before the reader actually reaches the end.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nextBefore, loadingMore, loadMore]);

  if (state.status === "loading") return <p className={styles.status}>טוען...</p>;
  if (state.status === "error") {
    return <p className={styles.status}>לא הצלחנו לטעון את הביקורות. נסו לרענן את הדף.</p>;
  }
  if (state.reviews.length === 0) {
    return <p className={styles.status}>עוד אין ביקורות בקורס הזה. אפשר להיות הראשונים לכתוב.</p>;
  }

  return (
    <>
      <ol className={styles.list}>
        {state.reviews.map((review) => (
          <li key={review.id} className={styles.item}>
            <MessageItem message={review}>
              {review.reply_count > 0 && (
                <ReplyThread reviewId={review.id} replyCount={review.reply_count} />
              )}
            </MessageItem>
          </li>
        ))}
      </ol>
      <div ref={sentinel} />
      {loadingMore && <p className={styles.status}>טוען...</p>}
    </>
  );
}