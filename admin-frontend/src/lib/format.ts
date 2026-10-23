/** Display helpers. All dates are shown in Israel time, whatever the browser's time zone. */

const TIME_ZONE = "Asia/Jerusalem";

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
}

/** For a list row, like a mail app: the time for today, the day for anything older. */
export function formatListTime(iso: string): string {
  const date = new Date(iso);
  // Compared as Israel dates, so "today" does not depend on the phone's time zone.
  const israelDay = (d: Date) => d.toLocaleDateString("he-IL", { timeZone: TIME_ZONE });
  if (israelDay(date) === israelDay(new Date())) {
    return date.toLocaleTimeString("he-IL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  }
  return formatDay(iso);
}