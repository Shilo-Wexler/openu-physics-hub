import type { CSSProperties } from "react";
import { NavLink } from "react-router";

import styles from "./BottomNav.module.css";
import type { Section, SectionId } from "./sections";

interface Props {
  sections: Section[];
  /** A red count on a tab (new inquiries, open reports). Zero or missing = no badge. */
  badges?: Partial<Record<SectionId, number>>;
}

/** The phone's tab bar. Hidden from 641px, where the header shows the same sections. */
export default function BottomNav({ sections, badges = {} }: Props) {
  return (
    <nav className={styles.bar} style={{ "--count": sections.length } as CSSProperties} aria-label="אזורים">
      {sections.map((section) => {
        const count = badges[section.id] ?? 0;
        return (
          <NavLink
            key={section.id}
            to={section.path}
            className={({ isActive }) => (isActive ? `${styles.tab} ${styles.current}` : styles.tab)}
          >
            <span className={styles.iconWrap}>
              <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
                {section.icon.map((d) => (
                  <path key={d} d={d} />
                ))}
              </svg>
              {count > 0 && (
                <span className={styles.badge}>
                  {count > 99 ? "99+" : count}
                  <span className={styles.visuallyHidden}> חדשות</span>
                </span>
              )}
            </span>
            {section.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
