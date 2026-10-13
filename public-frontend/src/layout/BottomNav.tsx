/** The bottom bar on a phone: the main sections plus the profile, with icons. Hidden on a computer. */

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

import { MAIN_SECTIONS, isInSection } from "./navSections";
import type { NavSection } from "./navSections";
import styles from "./BottomNav.module.css";

// On a computer the profile is the avatar in the header; on a phone it gets a tab of its own.
const PROFILE: NavSection = { to: "/profile", label: "פרופיל", prefixes: ["/profile"] };
const TABS = [...MAIN_SECTIONS, PROFILE];

// Outline icons on a 24x24 grid, drawn with the text color (see .icon in the CSS).
const ICONS: Record<string, ReactNode> = {
  "/": <path d="M3 11 12 4l9 7M5 10v10h14V10" />,
  "/chat": <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  "/inquiry": <path d="M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5" />,
  "/profile": (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
};

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="ראשי" className={styles.bar}>
      {TABS.map((tab) => {
        const current = isInSection(pathname, tab);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={current ? `${styles.tab} ${styles.current}` : styles.tab}
            aria-current={current ? "page" : undefined}
          >
            <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
              {ICONS[tab.to]}
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
