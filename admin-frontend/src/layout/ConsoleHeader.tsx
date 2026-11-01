import { NavLink } from "react-router";

import styles from "./ConsoleHeader.module.css";
import type { Section, SectionId } from "./sections";

interface Props {
  sections: Section[];
  /** Same counts as the bottom bar. */
  badges?: Partial<Record<SectionId, number>>;
}

export default function ConsoleHeader({ sections, badges = {} }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <NavLink to="/" end className={styles.brand}>
          <span className={styles.logo}>
            OpenU<span className={styles.logoMuted}>Voice</span>
          </span>
          <span className={styles.admin}>
            <AdminIcon />
            Admin
          </span>
        </NavLink>

        <nav className={styles.nav} aria-label="אזורים">
          {sections.map((section) => {
            const count = badges[section.id] ?? 0;
            return (
              <NavLink
                key={section.id}
                to={section.path}
                className={({ isActive }) => (isActive ? `${styles.link} ${styles.current}` : styles.link)}
              >
                {section.label}
                {count > 0 && (
                  <span className={styles.count}>
                    {count > 99 ? "99+" : count}
                    <span className={styles.visuallyHidden}> חדשות</span>
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/** A person with a small key: stands for the staff-only console. */
function AdminIcon() {
  return (
    <svg className={styles.adminIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c.7-3.4 3.3-5.3 6.5-5.3 1.2 0 2.3.3 3.2.8" />
      <circle cx="17.5" cy="15.5" r="2.2" />
      <path d="M17.5 17.7V21M17.5 19.5h1.6" />
    </svg>
  );
}
