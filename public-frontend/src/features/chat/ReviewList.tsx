import { useCallback, useEffect, useRef, useState } from "react";

import { listReviews, postMessage, type Review, type ReviewSort } from "../../shared/api/chat";
import { useAuth } from "../auth/AuthContext";
import Composer from "./Composer";
import ReviewCard from "./ReviewCard";
import styles from "./ReviewList.module.css";

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: "new", label: "חדשות" },
  { value: "top", label: "מובילות" },
];

/** A review this user posted on this page; `sending` until the server saved it. */
interface MyReview {
  review: Review;
  sending: boolean;
}

interface Props {
  courseId: number;
  /** A review already shown above the list (a shared one), left out of the list. */
  hiddenId?: number | null;
}

/** The reviews of a course, with sort tabs above them and the writing box below. */
export default function ReviewList({ courseId, hiddenId = null }: Props) {
  const [sort, setSort] = useState<ReviewSort>("new");
  // Reviews posted here, shown on top in every sort until the page is left.
  const [mine, setMine] = useState<MyReview[]>([]);

  const { user, loading } = useAuth();
  const userId = user?.user_id ?? null;
  // Goes up when someone signs in or out on this page, so the list reloads with the right
  // liked_by_me. The first /me answer does not count: the first request already sent the cookie.
  const [viewer, setViewer] = useState({ loading, userId, generation: 0 });
  if (viewer.loading !== loading || viewer.userId !== userId) {
    const changed = !viewer.loading;
    setViewer({ loading, userId, generation: changed ? viewer.generation + 1 : viewer.generation });
    if (changed) setMine([]); // the reloaded list has them, now with the right is_mine
  }

  const handleSend = useCallback(
    async (content: string) => {
      if (!user) return;
      // A temporary negative id: real ids are positive, so it never clashes with one.
      const tempId = -Date.now();
      const draft: Review = {
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
        reply_count: 0,
      };
      setMine((current) => [{ review: draft, sending: true }, ...current]);
      try {
        const saved = await postMessage(courseId, content);
        setMine((current) =>
          current.map((item) =>
            item.review.id === tempId
              ? { review: { ...item.review, id: saved.id, created_at: saved.created_at }, sending: false }
              : item,
          ),
        );
      } catch (error) {
        setMine((current) => current.filter((item) => item.review.id !== tempId));
        throw error; // the composer shows the reason and gives the text back
      }
    },
    [courseId, user],
  );

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

      {/* key: another sort, or another signed-in user, mounts a fresh list. */}
      <SortedReviews
        key={`${sort}-${viewer.generation}`}
        courseId={courseId}
        sort={sort}
        hiddenId={hiddenId}
        mine={mine}
      />

      <Composer
        sticky
        placeholder="כתבו ביקורת על הקורס..."
        label="ביקורת חדשה"
        onSend={handleSend}
      />
    </section>
  );
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; reviews: Review[]; nextBefore: number | null };

function SortedReviews({
  courseId,
  sort,
  hiddenId,
  mine,
}: Props & { sort: ReviewSort; mine: MyReview[] }) {
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
  // My new reviews come first; the server list may contain them too, so they are skipped there.
  const mineIds = new Set(mine.map((item) => item.review.id));
  const reviews = state.reviews.filter(
    (review) => review.id !== hiddenId && !mineIds.has(review.id),
  );
  if (reviews.length === 0 && mine.length === 0 && hiddenId === null) {
    return <p className={styles.status}>עוד אין ביקורות בקורס הזה. אפשר להיות הראשונים לכתוב.</p>;
  }

  return (
    <>
      <ol className={styles.list}>
        {mine.map(({ review, sending }) => (
          <li key={review.id} className={styles.item}>
            <ReviewCard review={review} courseId={courseId} />
            {sending && <p className={styles.status}>שולח...</p>}
          </li>
        ))}
        {reviews.map((review) => (
          <li key={review.id} className={styles.item}>
            <ReviewCard review={review} courseId={courseId} />
          </li>
        ))}
      </ol>
      <div ref={sentinel} />
      {loadingMore && <p className={styles.status}>טוען...</p>}
    </>
  );
}
