/** Admin levels, as the backend stores them (admins.role). The console calls them "תפקיד". */

export type Level = "super_admin" | "admin" | "member";

/** In the order the console offers them. */
export const LEVELS: Level[] = ["super_admin", "admin", "member"];

export const LEVEL_LABEL: Record<Level, string> = {
  super_admin: "מנהל ראשי",
  admin: "מנהל",
  member: "חבר ועדה",
};

export const LEVEL_HINT: Record<Level, string> = {
  super_admin: "אין הגבלות",
  admin: "הכול, חוץ מהוספה ושינוי של מנהלים ראשיים",
  member: "לא מנהל אחרים, ובהכרזות שומר רק טיוטות",
};

/** The levels this admin may give, and whose admins they may change or remove. A member: none. */
export function levelsManagedBy(level: Level): Level[] {
  if (level === "super_admin") return LEVELS;
  if (level === "admin") return ["admin", "member"];
  return [];
}