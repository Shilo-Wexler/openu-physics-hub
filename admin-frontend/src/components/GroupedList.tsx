import type { ReactNode } from "react";
import { Link } from "react-router";

import styles from "./GroupedList.module.css";

interface GroupProps {
  /** Small grey caption above the group. */
  title?: string;
  /** Small grey note under the group. */
  footer?: ReactNode;
  children: ReactNode;
}

/** A white rounded group of rows on the grey page, like iOS Settings. Children are Rows. */
export function Group({ title, footer, children }: GroupProps) {
  return (
    <section className={styles.section}>
      {title && <h2 className={styles.title}>{title}</h2>}
      <ul className={styles.group}>{children}</ul>
      {footer && <p className={styles.footer}>{footer}</p>}
    </section>
  );
}

interface RowProps {
  label: ReactNode;
  /** A second, grey line under the label. */
  detail?: ReactNode;
  /** Grey text at the far end: a count or the current value. */
  value?: ReactNode;
  /** Drawn before the label, such as a small coloured icon tile. */
  icon?: ReactNode;
  /** Opens another screen, and shows a chevron. */
  to?: string;
  /** An action row, such as sign out. Ignored when `to` is set. */
  onClick?: () => void;
  /** Red label, for an action that removes something or ends the session. Other action rows are blue. */
  danger?: boolean;
  /** One option of a list to pick from (a status, a role): stays black like plain text, not blue. */
  choice?: boolean;
}

/** One row of a Group: a link (to), a button (onClick) or plain text. */
export function Row({ label, detail, value, icon, to, onClick, danger = false, choice = false }: RowProps) {
  // Like iOS: a row that does something is coloured (red if it removes), so it reads as a button.
  const isAction = !to && onClick !== undefined && !choice;
  const labelClass = danger
    ? `${styles.label} ${styles.danger}`
    : isAction
      ? `${styles.label} ${styles.action}`
      : styles.label;
  const body = (
    <>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.content}>
        <span className={styles.text}>
          <span className={labelClass}>{label}</span>
          {detail && <span className={styles.detail}>{detail}</span>}
        </span>
        {value !== undefined && <span className={styles.value}>{value}</span>}
        {to && (
          <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        )}
      </span>
    </>
  );

  let row: ReactNode;
  if (to) {
    row = (
      <Link to={to} className={`${styles.row} ${styles.interactive}`}>
        {body}
      </Link>
    );
  } else if (onClick) {
    row = (
      <button type="button" className={`${styles.row} ${styles.interactive}`} onClick={onClick}>
        {body}
      </button>
    );
  } else {
    row = <div className={styles.row}>{body}</div>;
  }

  return <li className={styles.item}>{row}</li>;
}
