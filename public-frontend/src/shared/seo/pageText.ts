/**
 * The wording of page titles and descriptions, in one place. The app sets them in the browser
 * (usePageTitle), and the build writes them into each page's own HTML (vite.config.ts), so search
 * engines see them before running the app.
 */

export const SITE = "OpenUVoice";

/** Every page without a description of its own. The same text as in index.html (the build checks). */
export const SITE_DESCRIPTION =
  "פורטל הסטודנטים לפיזיקה באוניברסיטה הפתוחה: ביקורות וחוות דעת על קורסים, צ'אט, ופניות לוועד הסטודנטים.";

/** Fixed pages. A course page and the general chat set their own title, from the course. */
export const ROUTE_TITLES: Record<string, string> = {
  "/chat": "צ'אט",
  "/courses": "ביקורות על קורסים בפיזיקה",
  "/announcements": "הכרזות",
  "/inquiry": "פנייה לוועד הסטודנטים",
  "/profile": "פרופיל",
  "/about": "אודות",
  "/privacy": "פרטיות ותנאי שימוש",
  "/auth/done": "התחברות",
};

export const GENERAL_CHAT_TITLE = "צ'אט כללי";

/** The tab title: the page's name, then the site's. */
export function withSite(name: string): string {
  return `${name} · ${SITE}`;
}

export function courseTitle(name: string): string {
  return `${name}: ביקורות על הקורס`;
}

/** The text search engines show under a course's title. */
export function courseDescription(id: number, name: string): string {
  return `ביקורות, דירוגי קושי והמלצה וצ'אט של סטודנטים על הקורס ${name} (${id}) באוניברסיטה הפתוחה.`;
}