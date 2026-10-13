/** The top bar on every page: the logo, the main sections (computer only) and the account area. */

import { Link, useLocation } from "react-router";

import AccountArea from "./AccountArea";
import { MAIN_SECTIONS, isInSection } from "./navSections";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  const { pathname } = useLocation();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>
          OpenU<span className={styles.logoMuted}>Voice</span>
        </Link>

        {/* Hidden on a phone: the bottom bar (BottomNav) shows the same sections there. */}
        <nav aria-label="ראשי" className={styles.nav}>
          {MAIN_SECTIONS.map((section) => {
            const current = isInSection(pathname, section);
            return (
              <Link
                key={section.to}
                to={section.to}
                className={current ? `${styles.link} ${styles.current}` : styles.link}
                aria-current={current ? "page" : undefined}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        <AccountArea />
      </div>
    </header>
  );
}
