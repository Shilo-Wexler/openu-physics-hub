/** Console levels, as the backend stores them (admins.role). The console calls them "תפקיד". */

export type Level = "admin" | "committee" | "team";

/** In the order the console offers them. */
export const LEVELS: Level[] = ["admin", "committee", "team"];

export const LEVEL_LABEL: Record<Level, string> = {
  admin: "מנהל",
  committee: "חבר ועד",
  team: "צוות",
};

export const LEVEL_HINT: Record<Level, string> = {
  admin: "אין הגבלות",
  committee: "הכול, חוץ מהוספה ושינוי של מנהלים",
  team: "לא משנה אחרים, ובהכרזות שומר רק טיוטות",
};

/** The levels this level may give, and whose rows it may change or remove. Team: none. */
export function levelsManagedBy(level: Level): Level[] {
  if (level === "admin") return LEVELS;
  if (level === "committee") return ["committee", "team"];
  return [];
}
