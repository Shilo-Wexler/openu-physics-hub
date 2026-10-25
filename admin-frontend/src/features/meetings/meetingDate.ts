/** A meeting date is a calendar day ("YYYY-MM-DD"), not a moment. It is never turned into a Date:
    new Date("2026-10-20") is midnight UTC, which a time zone can move to another day. */

/** "2026-10-20" -> "20.10.2026", like dates elsewhere in the console. */
export function formatMeetingDate(value: string): string {
  const year = value.slice(0, 4);
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return `${day}.${month}.${year}`;
}

/** Today in local time as "YYYY-MM-DD": the default date of a new summary, and what a date input expects. */
export function todayMeetingDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}