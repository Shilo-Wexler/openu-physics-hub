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
