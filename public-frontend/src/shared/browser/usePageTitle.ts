/**
 * The browser tab's title and the page's description: the headline and the text under it that
 * search engines show for the page. The wording lives in shared/seo/pageText.ts, which the build
 * also uses to write each page's HTML.
 */

import { useEffect } from "react";
import { useLocation } from "react-router";

import { ROUTE_TITLES, SITE, SITE_DESCRIPTION, withSite } from "../seo/pageText";

// The home page says what the site is: most searches that find it land there.
const HOME_TITLE = `${SITE} · פורטל הסטודנטים לפיזיקה באוניברסיטה הפתוחה`;

const NOT_FOUND_TITLE = "הדף לא נמצא";

const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');

function setDescription(text: string): void {
  if (descriptionTag) descriptionTag.content = text;
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
    setDescription(SITE_DESCRIPTION);
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
    setDescription(description ?? SITE_DESCRIPTION);
  }, [name, description]);
}
