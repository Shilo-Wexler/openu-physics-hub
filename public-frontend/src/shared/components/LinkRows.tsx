/** Big rows that each lead to a page (the home page's areas, the /chat choices). */

import { Link } from "react-router";

import styles from "./LinkRows.module.css";

export interface LinkRow {
  to: string;
  title: string;
  /** One line about what is there. */
  text: string;
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
        {rows.map((row) => (
          <li key={row.to}>
            <Link to={row.to} className={styles.row}>
              <span className={styles.text}>
                <span className={styles.title}>{row.title}</span>
                <span className={styles.description}>{row.text}</span>
              </span>
              {/* Points left: "forward" in a right-to-left page. */}
              <svg className={styles.arrow} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
