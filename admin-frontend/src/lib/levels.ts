/**
 * Admin levels as shown in the console, on top of the roles stored by the backend
 * (admin, moderator, inquiries, announcements — the roles agreed with the chat side).
 */

export type Level = "full" | "standard";

/** Everything, including adding, changing and removing admins. */
export const FULL_ROLES = ["admin"];
/** Everything except managing admins. */
export const STANDARD_ROLES = ["announcements", "inquiries", "moderator"];

export const LEVEL_LABEL: Record<Level, string> = {
  full: "מנהל ראשי",
  standard: "מנהל",
};

export const LEVEL_HINT: Record<Level, string> = {
  full: "הכול, כולל הוספה, שינוי והסרה של מנהלים",
  standard: "הכול חוץ מניהול מנהלים",
};

export function levelOf(roles: string[]): Level {
  return roles.includes("admin") ? "full" : "standard";
}

export function rolesOf(level: Level): string[] {
  return level === "full" ? FULL_ROLES : STANDARD_ROLES;
}
