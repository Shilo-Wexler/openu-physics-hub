/** The rows of a list screen (inquiries, chat reports, announcements), like a mail app: a title line with
    the time, a second line, and a preview of up to two lines. Every list screen uses these, so they all
    look and behave the same, and a change to a row is made once. */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { formatListTime } from "../lib/format";
import styles from "./ListRow.module.css";

/** The white rounded box that ListRows sit in. */
export function RowList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

interface ListRowProps {
  /** The first line, cut with "..." when too long. A user's name goes in a bdi, so its direction is its own. */
  title: ReactNode;
  /** A bolder title, for something not yet handled (a new inquiry). */
  strong?: boolean;
  /** Drawn after the title, such as a count pill. */
  badge?: ReactNode;
  /** An ISO time, shown at the end of the first line. */
  time?: string;
  /** The second line, cut to one line. */
  subtitle?: ReactNode;
  /** Grey text of up to two lines, such as the start of a message. */
  preview?: ReactNode;
  /** Drawn before the text, such as a dot or a thumbnail. The separator line starts after it. */
  leading?: ReactNode;
  /** Opens a screen, and shows a chevron. Without it the row is plain text. */
  to?: string;
}

export function ListRow({ title, strong = false, badge, time, subtitle, preview, leading, to }: ListRowProps) {
  const body = (
    <>
      {leading && <span className={styles.leading}>{leading}</span>}
      {/* The separator line runs under the text and the chevron, not under the leading part. */}
      <span className={styles.content}>
        <span className={styles.body}>
          <span className={styles.top}>
            <span className={strong ? `${styles.title} ${styles.strong}` : styles.title}>{title}</span>
            {badge}
            {time && (
              <time className={styles.time} dateTime={time}>
                {formatListTime(time)}
              </time>
            )}
          </span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          {preview && (
            <span className={styles.preview} dir="auto">
              {preview}
            </span>
          )}
        </span>
        {/* Shows the row opens a screen, like every iOS list row that does. */}
        {to && (
          <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        )}
      </span>
    </>
  );

  return (
    <li className={styles.item}>
      {to ? (
        <Link to={to} className={`${styles.row} ${styles.link}`}>
          {body}
        </Link>
      ) : (
        <div className={styles.row}>{body}</div>
      )}
    </li>
  );
}

/** A grey line in place of the list: "loading", "nothing here". */
export function ListMessage({ children }: { children: ReactNode }) {
  return <p className={styles.message}>{children}</p>;
}

interface LoadMoreProps {
  loading: boolean;
  /** Also disabled while another list is on its way. */
  disabled?: boolean;
  onClick: () => void;
}

/** The button under a list that brings the next page. */
export function LoadMore({ loading, disabled = false, onClick }: LoadMoreProps) {
  return (
    <button type="button" className={styles.more} disabled={loading || disabled} onClick={onClick}>
      {loading ? "טוען…" : "טען עוד"}
    </button>
  );
}
