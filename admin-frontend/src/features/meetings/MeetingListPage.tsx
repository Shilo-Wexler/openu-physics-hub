/** The meeting summaries, newest meeting first, grouped by year. A row opens the summary;
    the round "+" starts a new one. Opened from the "more" screen. On a computer the summary opens
    beside the list (see SplitView), the newest one by itself. */

import { useEffect, useState, type MouseEvent } from "react";
import { Link, useMatch, useNavigate } from "react-router";

import { isAbort, isAuthError } from "../../shared/api/client";
import { listMeetings, type MeetingListItem } from "../../shared/api/meetings";
import BackLink from "../../shared/components/BackLink";
import { ListMessage, ListRow, RowList } from "../../shared/components/ListRow";
import { positionText, useAutoOpen, useReportPosition, useSplit } from "../../shared/components/SplitView";
import { errorMessage } from "../../shared/lib/errors";
import { useAdmin } from "../../layout/consoleContext";
import styles from "./MeetingListPage.module.css";
import { formatMeetingDate } from "./meetingDate";

const BASE = "/more/meetings";
const NEW_PATH = `${BASE}/new`;

/** Short month names for the date square on each row. */
const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

/** The round "+" that starts a new summary. On a computer it sits beside the title (SplitView draws it
    there) while a summary may be open beside the list, so unsaved changes there ask first. */
export function NewMeetingLink() {
  const { isDirty, confirmLeave } = useSplit();
  const navigate = useNavigate();

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!isDirty()) return;
    event.preventDefault();
    void confirmLeave().then((ok) => {
      if (ok) navigate(NEW_PATH);
    });
  }

  return (
    <Link to={NEW_PATH} className={styles.add} aria-label="סיכום חדש" onClick={open}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}

export default function MeetingListPage() {
  const { token, version, onAuthError } = useAdmin();
  const { split } = useSplit();
  const [items, setItems] = useState<MeetingListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // version: after a saved or deleted summary, the list loads again.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listMeetings(token, controller.signal)
      .then((page) => {
        setItems(page.items);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(errorMessage(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [token, version, onAuthError]);

  // On a computer with nothing open, the newest summary opens beside the list.
  const first = items?.[0];
  useAutoOpen(first ? `${BASE}/${first.id}` : null, loading, version);

  // Where the open summary sits in the list, shown above it on a computer: "סיכום 2 מתוך 9".
  const openId = Number(useMatch(`${BASE}/:id`)?.params.id);
  const index = items?.findIndex((m) => m.id === openId) ?? -1;
  useReportPosition(positionText("סיכום", index, items?.length));

  return (
    <>
      {/* On a computer the top bar's "עוד" is always in sight, and SplitView draws the title and the "+". */}
      {!split && (
        <>
          <BackLink to="/more" label="עוד" />
          <header className={styles.head}>
            <h1>סיכומי ישיבות</h1>
            <NewMeetingLink />
          </header>
        </>
      )}

      {error && <p className="error">{error}</p>}

      {!items ? (
        !error && <ListMessage>טוען…</ListMessage>
      ) : items.length === 0 ? (
        <ListMessage>עוד אין סיכומים.</ListMessage>
      ) : (
        byYear(items).map(([year, meetings]) => (
          <section key={year} className={styles.group}>
            <h2 className={styles.groupTitle}>
              {year}
              <span className={styles.groupCount}>{meetings.length}</span>
            </h2>
            <RowList>
              {meetings.map((m) => (
                <MeetingRow key={m.id} meeting={m} />
              ))}
            </RowList>
          </section>
        ))
      )}
    </>
  );
}

/** A square with the day and month, the title (or "ישיבה מ-<date>" without one), and one line under it. */
function MeetingRow({ meeting: m }: { meeting: MeetingListItem }) {
  // meeting_date is "YYYY-MM-DD".
  const month = Number(m.meeting_date.slice(5, 7));
  const day = Number(m.meeting_date.slice(8, 10));
  return (
    <ListRow
      to={`${BASE}/${m.id}`}
      leading={
        <span className={styles.date} aria-hidden="true">
          <span className={styles.day}>{day}</span>
          <span className={styles.month}>{MONTHS[month - 1]}</span>
        </span>
      }
      title={<bdi>{m.title || `ישיבה מ-${formatMeetingDate(m.meeting_date)}`}</bdi>}
      // Without a title the date already names the row, so the line under it says so instead.
      preview={<span className={styles.oneLine}>{m.title ? longDate(m.meeting_date) : "בלי כותרת"}</span>}
    />
  );
}

/** "יום שלישי, 28.10.26": the weekday helps place a meeting. The date is read as a local day (no time zone). */
function longDate(meetingDate: string): string {
  const year = Number(meetingDate.slice(0, 4));
  const month = Number(meetingDate.slice(5, 7));
  const day = Number(meetingDate.slice(8, 10));
  const weekday = new Date(year, month - 1, day).toLocaleDateString("he-IL", { weekday: "long" });
  return `${weekday}, ${formatMeetingDate(meetingDate)}`;
}

/** The list cut into years, keeping its order (newest first), so each year is one group. */
function byYear(items: MeetingListItem[]): [string, MeetingListItem[]][] {
  const groups: [string, MeetingListItem[]][] = [];
  for (const item of items) {
    const year = item.meeting_date.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last[0] === year) last[1].push(item);
    else groups.push([year, [item]]);
  }
  return groups;
}
