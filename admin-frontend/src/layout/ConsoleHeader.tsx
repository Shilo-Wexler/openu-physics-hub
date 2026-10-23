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
          <span className={styles.suffix}>ניהול</span>
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