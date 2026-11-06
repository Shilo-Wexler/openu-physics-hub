/** The home page's "new in the chat" section: the newest reviews of all courses and a way to
    write one. While the chat is still empty, one black band says so instead.
    Phone: one framed panel with a few one-line rows and a "write a review" button under them.
    Computer: a row of cards, closed by a black card that invites the reader to write.
    Shows nothing until the first answer arrives, or when it fails: the home page works without it. */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { GENERAL_COURSE_ID, getLatest, type LatestReview } from "../../shared/api/chat";
import Avatar from "../../shared/components/Avatar";
import { messagePath } from "../chat/share";
import styles from "./LatestChat.module.css";

// An open page asks again this often, so a review written meanwhile shows up by itself.
const REFRESH_MS = 60_000;
// How long a review that just showed up stays highlighted (the fade back is in the CSS).
const HIGHLIGHT_MS = 1_500;
// The phone's panel shows only this many rows, so the announcement starts on the first screen.
const PHONE_ROWS = 3;
// Where "write a review" leads: the course list, to pick the course first.
const WRITE_PATH = "/courses";

function ChatIcon() {
  return (
    <svg className={styles.titleIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}

function ReviewCard({ review, fresh }: { review: LatestReview; fresh: boolean }) {
  const course = review.course_id === GENERAL_COURSE_ID ? "צ'אט כללי" : review.course_name;
  const { like_count: likes, reply_count: replies } = review;

  return (
    <Link
      to={messagePath(review.course_id, review.id)}
      className={fresh ? `${styles.card} ${styles.fresh}` : styles.card}
    >
      <Avatar avatar={review.avatar} size={38} />
      <div className={styles.body}>
        <div className={styles.names}>
          <span className={styles.nickname} dir="auto">
            {review.nickname}
          </span>
          <span className={styles.course}>{course}</span>
        </div>

        {/* Already one line and cut short by the server; the CSS clamps it further. */}
        <p className={styles.text} dir="auto">
          {review.snippet}
        </p>

        {/* Only what there is: an empty review shows no "0 replies". Computer only. */}
        {(likes > 0 || replies > 0) && (
          <div className={styles.counts}>
            {likes > 0 && (
              <span>
                <HeartIcon />
                {likes}
                <span className={styles.hidden}> לייקים</span>
              </span>
            )}
            {replies > 0 && (
              <span>
                <ReplyIcon />
                {replies === 1 ? "תגובה אחת" : `${replies} תגובות`}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function LatestChat() {
  const [reviews, setReviews] = useState<LatestReview[] | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  // The ids already shown, to tell which ones a later load added. null before the first load.
  const shown = useRef<Set<number> | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;

    function load() {
      controller?.abort();
      controller = new AbortController();
      getLatest(controller.signal)
        .then(({ messages }) => {
          const before = shown.current;
          // The first load highlights nothing: everything on it is "new" to the reader.
          if (before) {
            const added = messages.filter((review) => !before.has(review.id));
            if (added.length > 0) setFresh(new Set(added.map((review) => review.id)));
          }
          shown.current = new Set(messages.map((review) => review.id));
          setReviews(messages);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          // A failed refresh keeps what is shown; a failed first load keeps the section hidden.
          console.error(error);
        });
    }

    // Only while the reader can see the page; coming back to the tab checks at once.
    function loadIfVisible() {
      if (document.visibilityState === "visible") load();
    }

    load();
    const timer = window.setInterval(loadIfVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", loadIfVisible);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", loadIfVisible);
    };
  }, []);

  // The highlight is a moment, not a state: it goes away by itself.
  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = window.setTimeout(() => setFresh(new Set()), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [fresh]);

  if (reviews === null) return null;

  // An empty chat looks like a start, not like an empty place.
  if (reviews.length === 0) {
    return (
      <section className={styles.section} aria-labelledby="latest-chat">
        <div className={styles.head}>
          <h2 className={styles.label} id="latest-chat">
            חדש בצ'אט
          </h2>
        </div>
        <div className={styles.empty}>
          <div className={styles.inviteText}>
            <h3 className={styles.inviteTitle}>הצ'אט רק נפתח</h3>
            <p>אפשר לפתוח אותו בביקורת על קורס שלמדת, או בשאלה בצ'אט הכללי.</p>
          </div>
          <Link to={WRITE_PATH} className={styles.button}>
            <PenIcon />
            כתיבת ביקורת
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.section} ${styles.panel}`} aria-labelledby="latest-chat">
      <div className={styles.head}>
        <h2 className={styles.label} id="latest-chat">
          <ChatIcon />
          חדש בצ'אט
        </h2>
        <Link to="/chat" className={styles.all}>
          לכל הצ'אטים
        </Link>
      </div>

      <ul className={styles.grid}>
        {reviews.map((review, index) => (
          <li key={review.id} className={index >= PHONE_ROWS ? styles.computerOnly : undefined}>
            <ReviewCard review={review} fresh={fresh.has(review.id)} />
          </li>
        ))}
        {/* Computer: always last, so the row is full even with one review, and reading leads
            to writing. The whole card is the link; the "button" inside only looks like one. */}
        <li className={styles.computerOnly}>
          <Link to={WRITE_PATH} className={`${styles.card} ${styles.invite}`}>
            <div className={styles.inviteText}>
              <h3 className={styles.inviteTitle}>כבר עשית קורס?</h3>
              <p>ביקורת קצרה שלך תעזור לסטודנטים הבאים לדעת למה הם נכנסים.</p>
            </div>
            <span className={styles.button}>
              <PenIcon />
              כתיבת ביקורת
            </span>
          </Link>
        </li>
      </ul>

      {/* Phone: the same invitation, as one wide button closing the panel. */}
      <Link to={WRITE_PATH} className={styles.writeBar}>
        <PenIcon />
        כתיבת ביקורת
      </Link>
    </section>
  );
}

