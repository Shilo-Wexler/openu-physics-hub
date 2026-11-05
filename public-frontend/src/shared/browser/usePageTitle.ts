/**
 * The browser tab's title and the page's description: the headline and the text under it that
 * search engines show for the page.
 */

import { useEffect } from "react";
import { useLocation } from "react-router";

const SITE = "OpenUVoice";

// The home page says what the site is: most searches that find it land there.
const HOME_TITLE = `${SITE} · פורטל הסטודנטים לפיזיקה באוניברסיטה הפתוחה`;

// Fixed pages. A course page and the general chat set their own title (usePageTitle), since only
// they know the course name.
const ROUTE_TITLES: Record<string, string> = {
  "/chat": "צ'אט",
  "/courses": "ביקורות על קורסים בפיזיקה",
  "/announcements": "הכרזות",
  "/inquiry": "פנייה לוועד הסטודנטים",
  "/profile": "פרופיל",
  "/about": "אודות",
  "/privacy": "פרטיות ותנאי שימוש",
  "/auth/done": "התחברות",
};

const NOT_FOUND_TITLE = "הדף לא נמצא";

// The description in index.html, for every page without one of its own. Google reads the
// description after running the app, so a course page can describe itself.
const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
const DEFAULT_DESCRIPTION = descriptionTag?.content ?? "";

function setDescription(text: string): void {
  if (descriptionTag) descriptionTag.content = text;
}

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
    if (ownsTitle(path)) return;
    document.title = path === "/" ? HOME_TITLE : withSite(ROUTE_TITLES[path] ?? NOT_FOUND_TITLE);
    setDescription(DEFAULT_DESCRIPTION);
  }, [pathname]);
}

/**
 * For a page that sets its own title (see ownsTitle), and optionally its description.
 * A null name keeps the current title, while loading.
 */
export function usePageTitle(name: string | null, description?: string): void {
  useEffect(() => {
    if (name === null) return;
    document.title = withSite(name);
    setDescription(description ?? DEFAULT_DESCRIPTION);
  }, [name, description]);
}
