/** The page to come back to after Google sign-in, which leaves the site and returns to /auth/done. */

const KEY = "signInReturnTo";

/** Called just before Google takes over the tab: remembers the current page. */
export function saveReturnPath(): void {
  const { pathname, search, hash } = window.location;
  try {
    sessionStorage.setItem(KEY, pathname + search + hash);
  } catch {
    // Storage can be blocked (some private modes); the visitor then lands on the home page.
  }
}

/** The remembered page, read once. Only a path on this site, never a link to another site. */
export function takeReturnPath(): string {
  let path: string | null = null;
  try {
    path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    // See saveReturnPath.
  }
  // "//other.com" and "/\other.com" are links to another site, so the path must start with
  // exactly one slash. /auth/done itself would just come back here.
  if (!path || !path.startsWith("/") || path[1] === "/" || path[1] === "\\") return "/";
  if (path.startsWith("/auth/done")) return "/";
  return path;
}
