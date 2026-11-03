/** The browser tab's title, which is also the headline search engines show for the page. */

import { useEffect } from "react";
import { useLocation } from "react-router";

const SITE = "OpenUVoice";

// The home page says what the site is: most searches that find it land there.
const HOME_TITLE = `${SITE} · פורטל הסטודנטים לפיזיקה באוניברסיטה הפתוחה`;

// Fixed pages. A course page and the general chat set their own title (usePageTitle), since only
// they know the course name.
const ROUTE_TITLES: Record<string, string> = {
  "/chat": "צ'אט",
  "/courses": "קורסים",
  "/announcements": "הכרזות",
  "/inquiry": "פנייה לוועד הסטודנטים",
  "/profile": "פרופיל",
  "/about": "אודות",
  "/privacy": "פרטיות ותנאי שימוש",
  "/auth/done": "התחברות",
};

const NOT_FOUND_TITLE = "הדף לא נמצא";

function withSite(name: string): string {
  return `${name} · ${SITE}`;
}

/** Paths whose page sets its own title. */
function ownsTitle(pathname: string): boolean {
  return (
    pathname === "/chat/general" ||
    pathname.startsWith("/chat/general/") ||
    pathname.startsWith("/courses/")
  );
}

/** For App: the title of every fixed page, and "not found" for an address the site does not have. */
export function useRouteTitle(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    // "/about/" is the same page as "/about".
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    if (path === "/") document.title = HOME_TITLE;
    else if (!ownsTitle(path)) document.title = withSite(ROUTE_TITLES[path] ?? NOT_FOUND_TITLE);
  }, [pathname]);
}

/** For a page that sets its own title (see ownsTitle). null keeps the current title, while loading. */
export function usePageTitle(name: string | null): void {
  useEffect(() => {
    if (name !== null) document.title = withSite(name);
  }, [name]);
}
