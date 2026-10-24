/** Big rows that each lead to a page (the home page's areas, the /chat choices). */

import { Link } from "react-router";

import styles from "./LinkRows.module.css";

export interface LinkRow {
  /** A path in this site, or a full URL when external is set. */
  to: string;
  title: string;
  /** One line about what is there. */
  text: string;
  /** Another site: opens in a new tab, with an "external" icon instead of the arrow. */
  external?: boolean;
}

interface Props {
  rows: LinkRow[];
  /** Names the list for screen readers, since it is a navigation block of its own. */
  label: string;
}

export default function LinkRows({ rows, label }: Props) {
  return (
    <nav aria-label={label}>
      <ul className={styles.rows}>
        {rows.map((row) => {
          const content = (
            <>
              <span className={styles.text}>
                <span className={styles.title}>{row.title}</span>
                <span className={styles.description}>{row.text}</span>
              </span>
              {row.external ? (
                // A box with an arrow out of it: the usual sign for "opens another site".
                <svg className={styles.arrow} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 3h6v6" />
                  <path d="M10 14L21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              ) : (
                // Points left: "forward" in a right-to-left page.
                <svg className={styles.arrow} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              )}
            </>
          );
          return (
            <li key={row.to}>
              {row.external ? (
                // noopener: the other site gets no handle on this tab.
                <a href={row.to} className={styles.row} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              ) : (
                <Link to={row.to} className={styles.row}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
